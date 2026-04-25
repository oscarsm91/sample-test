// Modelo de bicicleta simplificado, con sabor arcade:
//   - aceleración constante mientras pulsas gas
//   - resistencia (drag) cuadrática
//   - giro proporcional a velocidad pero con un mínimo a baja velocidad
//   - freno de mano = derrape (drift), reduce agarre lateral

const WHEELBASE = 2.6;            // m
const MAX_STEER = 0.6;            // rad (~34º)
const ENGINE_FORCE = 9.0;         // m/s^2 a velocidad cero
const BRAKE_FORCE = 18.0;         // m/s^2
const REVERSE_FORCE = 5.0;
const DRAG = 0.0006;              // resistencia cuadrática
const ROLL_RESIST = 1.4;          // rozamiento lineal
const MAX_FWD_SPEED = 38;         // m/s (~137 km/h)
const MAX_REV_SPEED = -8;         // m/s
const STEER_RATE = 3.0;           // rad/s a 0 km/h
const STEER_RATE_HIGH = 0.9;      // rad/s a velocidad máxima
const STEER_RETURN = 4.0;
const HANDBRAKE_DECEL = 22.0;

export class Car {
    constructor({ lat, lon, heading = 0 }) {
        this.lat = lat;
        this.lon = lon;
        // Estado expresado en metros locales: lo actualiza main.js cuando recentre.
        this.x = 0;
        this.y = 0;
        this.heading = heading;       // rad, 0 = norte, crece en sentido horario
        this.steer = 0;               // rad
        this.speed = 0;               // m/s a lo largo de heading
        this.handbrake = false;
        this.gear = 'N';
    }

    update(dt, input) {
        // Dirección
        const speedRatio = Math.min(1, Math.abs(this.speed) / MAX_FWD_SPEED);
        const steerRate = STEER_RATE * (1 - speedRatio) + STEER_RATE_HIGH * speedRatio;
        if (input.left)  this.steer -= steerRate * dt;
        if (input.right) this.steer += steerRate * dt;
        if (!input.left && !input.right) {
            // Auto-centrado
            const ret = STEER_RETURN * dt;
            if (Math.abs(this.steer) < ret) this.steer = 0;
            else this.steer -= Math.sign(this.steer) * ret;
        }
        this.steer = Math.max(-MAX_STEER, Math.min(MAX_STEER, this.steer));

        // Aceleración longitudinal
        let accel = 0;
        if (input.throttle) {
            // Más empuje cuanto más lento vas (sensación arcade)
            const t = 1 - Math.max(0, this.speed) / MAX_FWD_SPEED;
            accel += ENGINE_FORCE * Math.max(0.25, t);
        }
        if (input.brake) {
            if (this.speed > 0.5) {
                accel -= BRAKE_FORCE;
            } else {
                accel -= REVERSE_FORCE;
            }
        }
        // Drag y rozamiento
        accel -= DRAG * this.speed * Math.abs(this.speed);
        if (Math.abs(this.speed) > 0.01) {
            accel -= Math.sign(this.speed) * ROLL_RESIST;
        }
        // Freno de mano
        if (input.handbrake) {
            const dec = HANDBRAKE_DECEL * dt;
            if (Math.abs(this.speed) <= dec) this.speed = 0;
            else this.speed -= Math.sign(this.speed) * dec;
        }

        this.speed += accel * dt;
        this.speed = Math.max(MAX_REV_SPEED, Math.min(MAX_FWD_SPEED, this.speed));

        // Modelo de bicicleta: actualizar heading y posición
        // En nuestro sistema, heading = ángulo del eje del coche desde norte (eje +y),
        // creciendo hacia el este (+x). Es decir bearing como en MapLibre.
        const v = this.speed;
        const omega = (v / WHEELBASE) * Math.tan(this.steer);
        this.heading += omega * dt;
        // normalizar
        if (this.heading > Math.PI)  this.heading -= 2 * Math.PI;
        if (this.heading < -Math.PI) this.heading += 2 * Math.PI;

        const dx = Math.sin(this.heading) * v * dt;
        const dy = Math.cos(this.heading) * v * dt;

        // Marcha
        if (this.speed > 0.5) this.gear = 'D';
        else if (this.speed < -0.5) this.gear = 'R';
        else this.gear = 'N';

        return { dx, dy };
    }
}
