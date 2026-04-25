// Maneja teclado y botones táctiles. Expone un objeto con flags reactivos.

export class Input {
    constructor() {
        this.state = {
            throttle: false,
            brake: false,
            left: false,
            right: false,
            handbrake: false,
            reset: false,
        };
        this.#bindKeyboard();
        this.#bindTouch();
    }

    #set(key, down) {
        switch (key) {
            case 'KeyW': case 'ArrowUp':    this.state.throttle = down; break;
            case 'KeyS': case 'ArrowDown':  this.state.brake = down; break;
            case 'KeyA': case 'ArrowLeft':  this.state.left = down; break;
            case 'KeyD': case 'ArrowRight': this.state.right = down; break;
            case 'Space':                    this.state.handbrake = down; break;
            case 'KeyR':                     if (down) this.state.reset = true; break;
        }
    }

    #bindKeyboard() {
        const code = e => e.code || (
            e.key === 'ArrowUp' ? 'ArrowUp' :
            e.key === 'ArrowDown' ? 'ArrowDown' :
            e.key === 'ArrowLeft' ? 'ArrowLeft' :
            e.key === 'ArrowRight' ? 'ArrowRight' :
            e.key === ' ' ? 'Space' : e.key
        );
        window.addEventListener('keydown', e => {
            this.#set(code(e), true);
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(code(e))) e.preventDefault();
        });
        window.addEventListener('keyup', e => this.#set(code(e), false));
    }

    #bindTouch() {
        const buttons = document.querySelectorAll('.touch-btn');
        for (const btn of buttons) {
            const key = btn.dataset.key;
            const press = e => { e.preventDefault(); this.#set(key, true); };
            const release = e => { e.preventDefault(); this.#set(key, false); };
            btn.addEventListener('touchstart', press, { passive: false });
            btn.addEventListener('touchend', release);
            btn.addEventListener('touchcancel', release);
            btn.addEventListener('mousedown', press);
            btn.addEventListener('mouseup', release);
            btn.addEventListener('mouseleave', release);
        }
        // Mostrar controles táctiles si es móvil
        if ('ontouchstart' in window) {
            document.getElementById('touch-controls').classList.remove('hidden');
        }
    }

    consumeReset() {
        const r = this.state.reset;
        this.state.reset = false;
        return r;
    }
}
