// time-server/time-server.js
// Servidor de tiempo simple para Cristian Mejorado

const mqtt = require("mqtt");
const config = require("../config");

const brokerUrl = `mqtt://${config.broker.address}:${config.broker.port}`;
const clientId = "time_server_01";

const client = mqtt.connect(brokerUrl, { clientId });

const requestTopic = config.topics.time_request;

client.on("connect", () => {
  console.log(`[INFO] Servidor de Tiempo conectado a ${brokerUrl}`);

  client.subscribe(requestTopic, { qos: 0 }, (err) => {
    if (!err) {
      console.log(`[INFO] Escuchando solicitudes de tiempo en [${requestTopic}]`);
    } else {
      console.error("[ERROR] Al suscribirse al tópico de tiempo:", err);
    }
  });
});

client.on("message", (topic, message) => {
  if (topic !== requestTopic) return;

  try {
    const req = JSON.parse(message.toString());
    const deviceId = req.deviceId;

    if (!deviceId) {
      console.log("[WARN] Solicitud de tiempo sin deviceId");
      return;
    }

    // Hora del server en ms
    const serverTime = Date.now();
    const responseTopic = config.topics.time_response(deviceId);

    const payload = JSON.stringify({ serverTime });

    client.publish(responseTopic, payload, { qos: 0 }, () => {
      console.log(`[TIME] Respondiendo a ${deviceId} con ${serverTime}`);
    });
  } catch (e) {
    console.error("[ERROR] Procesando solicitud de tiempo:", e.message);
  }
});

client.on("error", (err) => {
  console.error("[ERROR] Error MQTT en time-server:", err);
});
