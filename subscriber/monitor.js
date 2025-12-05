// /subscriber/monitor.js

const mqtt = require("mqtt");
const config = require("../config");

const brokerUrl = `mqtt://${config.broker.address}:${config.broker.port}`;
const client = mqtt.connect(brokerUrl);


const monitorTopic = config.topics.status("+");

client.on("connect", () => {
  console.log(` Monitor conectado al broker en ${brokerUrl}`);

  client.subscribe(monitorTopic, { qos: 1 }, (err) => {
    if (!err) {
      console.log(
        ` Monitor suscrito a los cambios de estado en [${monitorTopic}]`,
      );
    } else {
      console.error(` Error al suscribirse:`, err);
    }
  });
});

client.on("message", (topic, message) => {
  try {
    const data = JSON.parse(message.toString());


    if (!data.deviceId || !data.status) {
      console.log(
        `[WARN] Mensaje de estado no reconocido (probablemente mutex), ignorando: ${message.toString()}`,
      );
      return; 
    }
  

    const deviceId = data.deviceId;
    const status = data.status.toUpperCase();

    const color = status === "ONLINE" ? "\x1b[32m" : "\x1b[31m";
    const resetColor = "\x1b[0m";

    console.log(`\n Actualización de Estado:`);
    console.log(`   - Dispositivo: ${deviceId}`);
    console.log(`   - Estado: ${color}${status}${resetColor}`);
  } catch (error) {
    console.error(
      " Error al procesar el mensaje de estado:",
      message.toString(),
    );
  }
});

client.on("error", (error) => {
  console.error(" Error de conexión:", error);
  client.end();
});
