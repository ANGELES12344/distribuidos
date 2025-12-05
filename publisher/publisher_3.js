// /publisher/publisher_3.js

const mqtt = require("mqtt");
const { broker, topics } = require("../config");

const DEVICE_ID = process.env.DEVICE_ID || "sensor-temperatura-1";

const client = mqtt.connect(`mqtt://${broker.address}:${broker.port}`);

client.on("connect", () => {
  console.log(`Publisher ${DEVICE_ID} conectado`);

  //  estado ONLINE
  client.publish(
    topics.status(DEVICE_ID),
    JSON.stringify({ deviceId: DEVICE_ID, status: "online" }),
    { qos: 1, retain: true }
  );

  // telemetría cada 2 segundos
  setInterval(() => {
    const value = (20 + Math.random() * 5).toFixed(2);

    const payload = {
      deviceId: DEVICE_ID,
      timestamp: new Date().toISOString(),
      temperatura: value
    };

    client.publish(
      topics.telemetry(DEVICE_ID),
      JSON.stringify(payload),
      { qos: 1 }
    );

    console.log("Publicado:", payload);
  }, 2000);
});

client.on("error", (error) => {
  console.error(`Error MQTT:`, error);
});
