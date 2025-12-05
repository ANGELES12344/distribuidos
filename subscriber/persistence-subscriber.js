// subscriber/persistence-subscriber.js
// =========================================
//  Persistencia con filtro temporal (±2s)
//  + Excepción Lamport/Vector si es consistente
//  + Guarda en InfluxDB
// =========================================

const mqtt = require("mqtt");
const { InfluxDB, Point } = require("@influxdata/influxdb-client");
const config = require("../config");

// --- Influx ---
const influxUrl = process.env.INFLUXDB_URL;
const influxToken = process.env.INFLUXDB_TOKEN;
const influxOrg = process.env.INFLUXDB_ORG;
const influxBucket = process.env.INFLUXDB_BUCKET;

// --- MQTT ---
const brokerUrl = `mqtt://${config.broker.address}:${config.broker.port}`;
const topic = config.topics.telemetry("+");

const clientId = `persistence_${Math.random().toString(16).slice(2, 8)}`;

// Relojes lógicos
let lamportClock = 0;
const VECTOR_PROCESS_COUNT = 5;
let vectorClock = new Array(VECTOR_PROCESS_COUNT).fill(0);
let lastVector = new Array(VECTOR_PROCESS_COUNT).fill(0);

// Influx client
const influx = new InfluxDB({ url: influxUrl, token: influxToken });
const writeApi = influx.getWriteApi(influxOrg, influxBucket, "ms");

const client = mqtt.connect(brokerUrl, { clientId });

client.on("connect", () => {
  console.log(`[INFO] Persistencia conectada a MQTT en ${brokerUrl}`);
  client.subscribe(topic, { qos: 1 });
});

client.on("message", (receivedTopic, message) => {
  // Evento interno
  lamportClock++;

  try {
    const data = JSON.parse(message.toString());

    const now = Date.now();
    const msgTime = new Date(data.timestamp).getTime();
    const delta = Math.abs(now - msgTime);

    const incomingLamport = data.lamport_ts || 0;
    const incomingVector =
      data.vector_clock || new Array(VECTOR_PROCESS_COUNT).fill(0);

    // ========== Filtro de tiempo (±2s) con excepción ==========
    if (delta > 2000) {
      // Excepción: Lamport mayor y vector consistente (no retrocede)
      let lamportOK = incomingLamport > lamportClock;
      let vectorOK = true;
      for (let i = 0; i < VECTOR_PROCESS_COUNT; i++) {
        if (incomingVector[i] < vectorClock[i]) {
          vectorOK = false;
          break;
        }
      }

      if (lamportOK && vectorOK) {
        console.log(
          `[WARN] Mensaje fuera de rango (>2s) pero Lamport/Vector válidos → lo acepto forzado`
        );
        lamportClock = incomingLamport;
        for (let i = 0; i < VECTOR_PROCESS_COUNT; i++) {
          vectorClock[i] = Math.max(vectorClock[i], incomingVector[i]);
        }
      } else {
        console.log(
          `[DROP] Rejected future packet (delta=${delta}ms, dev=${data.deviceId})`
        );
        return;
      }
    } else {
      // Fusión normal Lamport/Vector si está dentro de rango
      lamportClock = Math.max(lamportClock, incomingLamport);
      for (let i = 0; i < VECTOR_PROCESS_COUNT; i++) {
        vectorClock[i] = Math.max(vectorClock[i], incomingVector[i] || 0);
      }
    }

    lastVector = incomingVector;

    // ========== Guardar en Influx ==========
    const point = new Point("sensor_data")
      .tag("device_id", data.deviceId)
      .floatField("temperature", data.temperatura)
      .floatField("humidity", data.humedad)
      .intField("lamport", lamportClock)
      .tag("vector_clock", JSON.stringify(vectorClock))
      .timestamp(new Date(data.timestamp));

    writeApi.writePoint(point);
    writeApi.flush();

    console.log(`[DB] Guardado OK: ${data.deviceId}`);
  } catch (e) {
    console.error("[ERROR] Procesando mensaje en persistencia:", e.message);
  }
});

client.on("error", (err) => {
  console.error("[ERROR] Error MQTT en persistencia:", err);
});
