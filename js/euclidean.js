// Euclidean rhythm generator (Bjorklund algorithm)
// Distributes `hits` as evenly as possible across `steps`
function euclidean(hits, steps) {
    if (hits >= steps) return new Array(steps).fill(1);
    if (hits <= 0) return new Array(steps).fill(0);

    let pattern = [];
    for (let i = 0; i < steps; i++) {
        pattern.push(i < hits ? [1] : [0]);
    }

    let level = 0;
    let divisor = steps - hits;
    let remainder = hits;

    while (remainder > 1) {
        const newPattern = [];
        const minLen = Math.min(divisor, remainder);

        for (let i = 0; i < minLen; i++) {
            newPattern.push(pattern[i].concat(pattern[pattern.length - 1 - i]));
        }

        if (divisor > remainder) {
            for (let i = minLen; i < divisor; i++) {
                newPattern.push(pattern[pattern.length - 1 - i]);
            }
        } else {
            for (let i = minLen; i < remainder; i++) {
                newPattern.push(pattern[i]);
            }
        }

        pattern = newPattern;
        const oldRemainder = remainder;
        remainder = divisor > remainder ? divisor - remainder : remainder - divisor;
        divisor = minLen;
        level++;
    }

    return pattern.flat();
}
