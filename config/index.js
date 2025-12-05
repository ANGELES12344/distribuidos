// config/index.js
// Archivo de configuración central de mi proyecto MQTT distribuido

/*
config.topics.telemetry(deviceId)
config.topics.status(deviceId)
config.topics.mutex_request
*/


/**
 * Archivo central de configuración para la aplicación MQTT.
 * Aquí se definen las direcciones del broker y la estructura de los tópicos.
 */

module.exports = {
  broker: {
    address: "mqtt-broker",
    port: 1883,
  },

  topics: {
    base: "utp/sistemas_distribuidos/grupo1",

    // Telemetría por dispositivo
    telemetry: (deviceId) => `utp/sistemas_distribuidos/grupo1/${deviceId}/telemetry`,

    // Estado del dispositivo
    status: (deviceId) => `utp/sistemas_distribuidos/grupo1/${deviceId}/status`,

    // Cristian mejorado: request/response
    time_request: "utp/sistemas_distribuidos/grupo1/time/request",
    time_response: (deviceId) => `utp/sistemas_distribuidos/grupo1/time/response/${deviceId}`,
  },
};



/*Mi archivo funciona, pero es una versión mínima del sistema distribuidos porque enfoqué primero en la telemetría, sincronización de reloj y comunicación base.
Los tópicos de exclusión mutua no los incluí aún porque preferí modularizar el proyecto e incorporarlos después, una vez que funcione correctamente el reloj y la comunicación básica entre nodos.
Sin embargo, ya tengo lista la estructura y puedo extenderla fácilmente, siguiendo el mismo estándar que usé para los demás tópicos. */