# Proyecto Final – Sistemas Distribuidos  
### Implementación completa de: Cristian Mejorado • Bully • Leases • WAL • Vector Clock • Split-Brain

---

## Resumen del Proyecto

Este proyecto implementa un sistema distribuido basado en:

- **5 nodos (publishers)** con prioridades: 10–50  
- **Elección de líder (algoritmo Bully)**  
- **Leases** (renovación cada 2s, expira en 5s)  
- **Sincronización de relojes (Cristian Mejorado)**  
- **Filtro temporal estricto (±2s)**  
- **Excepción Lamport/Vector para orden causal**  
- **Persistencia con WAL** (Write-Ahead Log)  
- **Recuperación del líder tras crash**  
- **Validación con script chaos-ultimate.sh**

Este README sirve como guía para el profesor sobre la configuración y cómo ejecutar las pruebas del PDF.

---

## Arquitectura

- `publisher/` → lógica de elección, lease, WAL, telemetría  
- `subscriber/` → persistencia con filtro temporal  
- `time-server/` → servidor de tiempo  
- `docker-compose.yml` → despliegue completo  
- `chaos-ultimate.sh` → script de validación del examen  

---

## Cómo iniciar el sistema

1. En Git Bash:

```bash
docker compose down --volumes
docker compose up --build
./chaos-ultimate.sh