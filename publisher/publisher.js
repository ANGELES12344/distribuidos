// publisher/publisher.js
// ==========================================
//  Publisher de sensor con:
//  - Reloj simulado + Cristian mejorado
//  - Reloj lógico (Lamport) + vector clock
//  - Elección de líder con prioridades (Bully)
//  - Leases (lease de 5s, renovado cada 2s)
//  - WAL para la cola de mutex (fase 3)
// ==========================================

const mqtt = require("mqtt");
const fs = require("fs");
const config = require("../config");

// VARIABLES DEL ENTORNO

//(“sensor-x”) → evita errores si falta una variable.
const DEVICE_ID = process.env.DEVICE_ID || "sensor-x";

const PRIORITY = parseInt(process.env.PRIORITY || "0", 10);
//PROCESS_ID → necesario para vector clock.
const PROCESS_ID = parseInt(process.env.PROCESS_ID || "0", 10);

// Lista de participantes 
const PARTICIPANTS = (process.env.ELECTION_PARTICIPANTS || "")
  .split(",")
  .filter(Boolean)
  .map((item) => {
    const [id, prio] = item.split(":");
    return { id, priority: parseInt(prio, 10) };
  });

// Rutas de tópicos de eleccion y mutex (los dejo aquí a mano)
const T_ELECTION_REQ = "election/request";
const T_ELECTION_ACK = (id) => `election/ack/${id}`;
const T_ELECTION_LEASE = "election/lease";

const T_MUTEX_REQ = "mutex/request";
const T_MUTEX_GRANT = (id) => `mutex/grant/${id}`;
const T_MUTEX_RELEASE = "mutex/release";

// WAL: guardo la cola en un archivo por sensor (compartido en volumen)
const WAL_FILE = `/data/wal_${DEVICE_ID}.log`;

// --------- Estado del nodo ---------
let ROLE = "FOLLOWER"; // FOLLOWER | CANDIDATE | LEADER
let ackCount = 0;
let lastLeaseTime = Date.now();

// Cola de espera para el recurso (solo usada si soy líder)
let waitingQueue = [];

// Reloj simulado (drift)
const CLOCK_DRIFT_RATE = parseFloat(process.env.CLOCK_DRIFT_RATE || "0"); // ms extra por segundo
const realStart = Date.now();
let lastReal = realStart;
let lastSim = realStart;

// Offset calculado por Cristian (para corregir reloj local)
let clockOffset = 0;
let t1Sync = 0;

// Relojes lógicos
let lamport = 0;
const VECTOR_SIZE = 5; // AHORA 5 procesos 
let vectorClock = new Array(VECTOR_SIZE).fill(0);

// Estado lógico del sensor 
let sensorState = "IDLE";

// Tópicos de estado/telemetría
const statusTopic = config.topics.status(DEVICE_ID);
const telemetryTopic = config.topics.telemetry(DEVICE_ID);

// Cliente MQTT 
const mqttUrl = `mqtt://${config.broker.address}:${config.broker.port}`;

const client = mqtt.connect(mqttUrl, {
  clientId: `pub_${DEVICE_ID}_${Math.random().toString(16).slice(2, 6)}`,
  will: {
    topic: statusTopic,
    payload: JSON.stringify({ deviceId: DEVICE_ID, status: "offline" }),
    retain: true,
    qos: 1,
  },
});

// ============== Funciones de reloj =================

// Mi reloj simulado con drift (lo dejo simple para entenderlo yo mismo)
function getSimTime() {
  const now = Date.now();
  const realElapsed = now - lastReal;

  // Deriva: cada segundo real le sumo CLOCK_DRIFT_RATE ms
  const drift = (realElapsed / 1000) * CLOCK_DRIFT_RATE;
  const simElapsed = realElapsed + drift;

  const sim = lastSim + simElapsed;
  lastReal = now;
  lastSim = sim;

  // Devuelvo como Date pero en ms entero
  return new Date(Math.floor(sim));
}

// Reloj corregido usando offset (Cristian)
function getCorrectedTime() {
  const sim = getSimTime();
  return new Date(sim.getTime() + clockOffset);
}

// ============== WAL (Write-Ahead Log) =================

function walAppend(entry) {
  try {
    fs.appendFileSync(WAL_FILE, JSON.stringify(entry) + "\n");
  } catch (e) {
    console.error(`[WAL] Error al escribir WAL:`, e.message);
  }
}

function walRestore() {
  if (!fs.existsSync(WAL_FILE)) return [];

  try {
    const raw = fs.readFileSync(WAL_FILE, "utf8").trim();
    if (!raw) return [];
    return raw.split("\n").map((line) => JSON.parse(line));
  } catch (e) {
    console.error("[WAL] Error al leer WAL:", e.message);
    return [];
  }
}

// ============== Elección (Bully) =================

function startElection() {
  ROLE = "CANDIDATE";
  ackCount = 1; // Me cuento a mí

  console.log(`[ELECTION] ${DEVICE_ID} inició elección (prio ${PRIORITY})`);

  const payload = JSON.stringify({
    deviceId: DEVICE_ID,
    priority: PRIORITY,
  });

  client.publish(T_ELECTION_REQ, payload, { qos: 1 });
}

// Timer para detectar expiración del lease (solo followers/candidates)
function checkLeaseExpiration() {
  if (ROLE === "LEADER") return;

  const now = Date.now();
  const diff = now - lastLeaseTime;

  // Si pasa más de 5s sin ver lease -> elección
  if (diff > 5000) {
    console.log(
      `[LEASE] No se vio lease en 5s → ${DEVICE_ID} inicia elección (diff=${diff}ms)`
    );
    startElection();
  }
}

// ============== Mutex (para fase 3) =================

function handleMutexRequest(data) {
  // Para simplificar: solo el líder maneja la cola
  if (ROLE !== "LEADER") return;

  const id = data.deviceId;
  if (!waitingQueue.includes(id)) {
    waitingQueue.push(id);
    walAppend({ op: "push", deviceId: id });
  }

  // Si está al frente, le otorgo el recurso
  if (waitingQueue[0] === id) {
    client.publish(T_MUTEX_GRANT(id), JSON.stringify({ grant: true }), {
      qos: 1,
    });
  }
}

function handleMutexRelease(data) {
  if (ROLE !== "LEADER") return;

  const id = data.deviceId;
  if (waitingQueue[0] === id) {
    waitingQueue.shift();
    walAppend({ op: "pop", deviceId: id });

    if (waitingQueue.length > 0) {
      const nextId = waitingQueue[0];
      client.publish(T_MUTEX_GRANT(nextId), JSON.stringify({ grant: true }), {
        qos: 1,
      });
    }
  }
}

// ============== MQTT: on connect =================

client.on("connect", () => {
  console.log(`[INFO] Sensor ${DEVICE_ID} conectado a ${mqttUrl}`);

  // Publico mi estado online
  client.publish(
    statusTopic,
    JSON.stringify({ deviceId: DEVICE_ID, status: "online" }),
    { retain: true, qos: 1 }
  );

  // Suscripciones básicas
  client.subscribe(T_ELECTION_REQ);
  client.subscribe(T_ELECTION_LEASE);
  client.subscribe(T_ELECTION_ACK(DEVICE_ID));
  client.subscribe(T_MUTEX_REQ);
  client.subscribe(T_MUTEX_RELEASE);
  client.subscribe(config.topics.time_response(DEVICE_ID));

  // Cristian mejorado: pido hora al conectarme
  t1Sync = Date.now();
  client.publish(
    config.topics.time_request,
    JSON.stringify({ deviceId: DEVICE_ID })
  );

  // Revisión periódica del lease
  setInterval(checkLeaseExpiration, 2000);

  // Envío de lease si soy líder (cada 2s)
  setInterval(() => {
    if (ROLE === "LEADER") {
      const payload = JSON.stringify({
        leader: DEVICE_ID,
        priority: PRIORITY,
        ts: Date.now(),
      });
      client.publish(T_ELECTION_LEASE, payload, { qos: 1, retain: true });
    }
  }, 2000);

  // Telemetría cada ~3–4s
  setInterval(sendTelemetry, 3500 + Math.random() * 1000);

  // Al inicio, si pasan 3s y no veo lease, inicio elección
  setTimeout(() => {
    const diff = Date.now() - lastLeaseTime;
    if (ROLE === "FOLLOWER" && diff > 3000) {
      console.log(
        `[LEASE] No se detectó líder al inicio → ${DEVICE_ID} inicia elección`
      );
      startElection();
    }
  }, 3000);
});

// ============== MQTT: on message =================

client.on("message", (topic, msg) => {
  let data;
  try {
    data = JSON.parse(msg.toString());
  } catch (e) {
    console.error("[MQTT] Mensaje no es JSON:", msg.toString());
    return;
  }

  // ---------- Respuesta de tiempo (Cristian) ----------
  if (topic === config.topics.time_response(DEVICE_ID)) {
    const t2 = Date.now();
    const rtt = t2 - t1Sync;

    // Regla del examen: si RTT > 500ms, no confío
    if (rtt > 500) {
      console.log(`[SYNC] RTT muy alto (${rtt}ms) → ignorado`);
      return;
    }

    const serverTime = data.serverTime;
    const corrected = serverTime + rtt / 2;

    const sim = getSimTime().getTime();
    clockOffset = corrected - sim;

    console.log(`[SYNC] Offset aplicado: ${clockOffset} ms (RTT=${rtt}ms)`);
    return;
  }

  // ---------- Lease recibido ----------
  if (topic === T_ELECTION_LEASE) {
    // Si el lease viene de mí mismo y soy líder, solo actualizo tiempo
    if (data.leader === DEVICE_ID && ROLE === "LEADER") {
      lastLeaseTime = Date.now();
      return;
    }

    // Si viene de otro líder
    lastLeaseTime = Date.now();

    if (data.leader !== DEVICE_ID) {
      if (ROLE === "LEADER") {
        console.log(
          `[LEASE] ${DEVICE_ID} se baja del liderazgo (Stepping down, líder actual: ${data.leader})`
        );
      }
      if (ROLE === "CANDIDATE") {
        console.log(
          `[LEASE] ${DEVICE_ID} cancela elección al ver lease de ${data.leader}`
        );
      }

      ROLE = "FOLLOWER";
    }
    return;
  }

  // ---------- Petición de elección (Bully) ----------
  if (topic === T_ELECTION_REQ) {
    const otherId = data.deviceId;
    const otherPriority = data.priority;

    // Si el otro tiene prioridad mayor, le doy ACK y me hago follower
    if (otherPriority > PRIORITY) {
      client.publish(
        T_ELECTION_ACK(otherId),
        JSON.stringify({ from: DEVICE_ID }),
        { qos: 1 }
      );
      ROLE = "FOLLOWER";
    }
    // Si mi prioridad es igual o mayor, simplemente ignoro su request
    return;
  }

  // ---------- Mis ACKs para la elección ----------
  if (topic === T_ELECTION_ACK(DEVICE_ID)) {
    ackCount++;

    // Mayoría simple con 5 nodos = 3
    if (ROLE === "CANDIDATE" && ackCount >= 3) {
      ROLE = "LEADER";

      // Al volverme líder, reconstruyo estado desde WAL
      const walEntries = walRestore();
      waitingQueue = [];
      walEntries.forEach((entry) => {
        if (entry.op === "push") waitingQueue.push(entry.deviceId);
        if (entry.op === "pop" && waitingQueue[0] === entry.deviceId) {
          waitingQueue.shift();
        }
      });

      console.log(
        `[RECOVERY] Restored queue: [${waitingQueue.join(", ")}]`
      );
      console.log(`[ELECTION] ${DEVICE_ID} Ascendido a Líder`);
    }
    return;
  }

  // ---------- Mutex ----------
  if (topic === T_MUTEX_REQ) {
    return handleMutexRequest(data);
  }
  if (topic === T_MUTEX_RELEASE) {
    return handleMutexRelease(data);
  }
});

// ============== Telemetría =================

function sendTelemetry() {
  // Evento interno → Lamport y vector clock
  lamport++;
  if (PROCESS_ID >= 0 && PROCESS_ID < VECTOR_SIZE) {
    vectorClock[PROCESS_ID]++;
  }

  const correctedTime = getCorrectedTime();

  const temp = (20 + Math.random() * 5).toFixed(2);
  const hum = (40 + Math.random() * 10).toFixed(2);

  const payload = {
    deviceId: DEVICE_ID,
    temperatura: parseFloat(temp),
    humedad: parseFloat(hum),
    timestamp: correctedTime.toISOString(),
    lamport_ts: lamport,
    vector_clock: vectorClock,
    sensor_state: sensorState,
  };

  client.publish(telemetryTopic, JSON.stringify(payload), { qos: 1 });

  // Solo para ver algo en consola si quiero
  // console.log(`[PUB] ${DEVICE_ID} ->`, payload);
}
