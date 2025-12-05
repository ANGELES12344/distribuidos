# EVIDENCIAS – Proyecto Sistema Distribuido (Fase 0–3)

Este documento contiene las evidencias solicitadas en la rúbrica para demostrar el funcionamiento correcto del sistema distribuido:

- Sincronización de relojes (Cristian mejorado)
- Filtro temporal estricto (±2s) con excepción Lamport/Vector
- Elección de líder (Bully + Prioridades)
- Manejo de Lease (renovación cada 2s / expiración 5s)
- Split-Brain resuelto
- Recuperación con WAL (Write-Ahead Log)
- Validación con el script oficial *chaos-ultimate.sh*

---

# FASE 0 – 5 Publishers Desplegados

Cada publisher tiene:

- ID único (`sensor-11` … `sensor-15`)
- PRIORITY: 10, 20, 30, 40, 50
- Variable `ELECTION_PARTICIPANTS` idéntica en todos
- Lock-coordinator desactivado

DOCKER PS

04ba36931d53   distribuidos-master-publisher-12             "docker-entrypoint.s…"   7 seconds ago    Up 3 seconds                                                        
                                      publisher-12
286b454514f1   distribuidos-master-publisher-14             "docker-entrypoint.s…"   7 seconds ago    Up 3 seconds                                                        
                                      publisher-14
6d08869dc7d2   distribuidos-master-publisher-15             "docker-entrypoint.s…"   7 seconds ago    Up 3 seconds                                                        
                                      publisher-15
5b18a8bc3245   distribuidos-master-publisher-11             "docker-entrypoint.s…"   7 seconds ago    Up 3 seconds                                                        
                                      publisher-11
0757649c521c   distribuidos-master-publisher-13             "docker-entrypoint.s…"   7 seconds ago    Up 3 seconds                                                        
                                      publisher-13
7e6ff337af54   distribuidos-master-persistence-subscriber   "docker-entrypoint.s…"   8 seconds ago    Up 4 seconds   

✔ Todos los nodos están correctamente levantados (publisher-11 al publisher-15).

---

# FASE 1 – Integridad Temporal

## 1. Cristian Mejorado (RTT + offset)

[SYNC] Offset aplicado: -18.5 ms (RTT=29ms)

✔ RTT bajo → sincronización válida  
✔ Offset aplicado correctamente

## 2. Rechazo de mensajes futuros (Time Travel Attack)

Salida del Chaos:

 ✔ EXITO: El ataque temporal fue rechazado correctamente.



El sistema rechazó mensajes con timestamp inválido del año 2050  
El mensaje no fue guardado en InfluxDB

---

# FASE 2 – Consenso (Bully + Leases + Split-Brain)

publisher-15:
[LEASE] No se detectó líder al inicio → sensor-15 inicia elección
[ELECTION] sensor-15 inició elección (prio 50)
[ELECTION] sensor-15 Ascendido a Líder

publisher-14:
[LEASE] No se detectó líder al inicio → sensor-14 inicia elección
[ELECTION] sensor-14 inició elección (prio 40)
[ELECTION] sensor-14 Ascendido a Líder

### Evidencia del Chaos (Split-Brain):

[FASE 2] Probando estabilidad de liderazgo (Split-Brain)...
 -> Líder supuesto: publisher-15
 -> Congelando al líder (pause)...
publisher-15
 -> Verificando si otro nodo tomó liderazgo...
 ✔ Nuevo líder detectado: publisher-14
 -> Restaurando al líder original...
publisher-15
 ✔ EXITO: El viejo líder se dio cuenta y se bajó (Stepping down).


# FASE 3 – Resiliencia (WAL)

El script del caos fuerza:

1. Generar cola (tráfico)
2. Matar violentamente al líder actual
3. Verificar recuperación


[FASE 3] Probando Recuperación de Estado (WAL)...
 -> Generando tráfico (simulación de cola)...
 -> Reiniciando violentamente al nuevo líder...
publisher-14
 ✔ EXITO: El líder restauró la cola desde el WAL.



 # RESULTADO FINAL – TODAS LAS FASES SUPERADAS

Salida completa del Chaos Ultimate:

 TODAS LAS FASES SUPERADAS CORRECTAMENTE 