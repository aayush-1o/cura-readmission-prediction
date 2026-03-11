import { useState, useEffect } from 'react';

/**
 * useCountUp — animates a number from 0 → target with an ease-out-expo curve.
 *
 * @param {number} target      - The final value to count up to
 * @param {number} duration    - Animation duration in ms (default 900)
 * @param {number} startDelay  - Delay before animation begins in ms (default 0)
 * @returns {number}           - Current animated value
 */
export function useCountUp(target, duration = 900, startDelay = 0) {
    const [value, setValue] = useState(0);

    useEffect(() => {
        if (target === 0) { setValue(0); return; }

        const timeout = setTimeout(() => {
            const startTime = performance.now();

            const tick = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                // Ease out expo — fast start, satisfying settle
                const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
                setValue(eased * target);
                if (progress < 1) requestAnimationFrame(tick);
            };

            requestAnimationFrame(tick);
        }, startDelay);

        return () => clearTimeout(timeout);
    }, [target, duration, startDelay]);

    return value;
}
