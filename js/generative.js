function makeCDF(map) {
	const keys = [];
	const cumulativeProbabilities = [];
	let total = 0;
	for (let frequency of map.values()) {
		total += frequency;
	}
	let sum = 0;
	for (let [key, frequency] of map.entries()) {
		keys.push(key);
		sum += frequency / total;
		cumulativeProbabilities.push(sum);
	}
	return [cumulativeProbabilities, keys];
}

function cdfLookup(distribution) {
	const probability = Math.random();
	const probabilities = distribution[0];
	const values = distribution[1];
	const length = probabilities.length;
	i = 0;
	while (i < length - 1 && probabilities[i] < probability) {
		i++
	}
	return values[i];
}

function uniformCDF(from, to) {
	const n = to - from + 1;
	const values = new Array(n);
	const cumulativeProbabilities = new Array(n);
	for (let i = 0; i < n; i++) {
		values[i] = from + i;
		cumulativeProbabilities[i] = (i + 1) / n;
	}
	return [cumulativeProbabilities, values];
}

const TimeSignatureType = Object.freeze({
	SIMPLE: 1,
	COMPOUND: 3,
	ANY: 0,
});

class RhythmGenerator {
	constructor() {
		// Approximate length in semiquavers.
		this.lengthDist = uniformCDF(2, 12);

		/* Frequency distribution of initial duplets and triplets for complex time signatures
		 * (and maybe quintuplets or septuplets).
		 */
		this.subdivisionDist = makeCDF(new Map([[2, 2], [3, 1]]));

		// Turns semi-quavers into quavers, triplets into dotted quavers, etc.
		this.longNoteProbability = 0.5;

		// Distribution of rests, assuming a 16 beat length
		this.restTimeDist = uniformCDF(0, 8);
	}

	generate(timeSignatureType) {
		let length = cdfLookup(this.lengthDist);
		let lengths;
		switch (timeSignatureType) {
		case TimeSignatureType.SIMPLE:
			lengths = new Array(length);
			lengths.fill(1);
			break;

		case TimeSignatureType.COMPOUND:
			length = Math.round(Math.max(length, 3) / 3) * 3;
			lengths = new Array(length / 3);
			lengths.fill(3);
			break;

		case TimeSignatureType.ANY:
			lengths = [];
			let lengthSoFar = 0;
			while (lengthSoFar < length - 1) {
				const subdivision = cdfLookup(this.subdivisionDist);
				lengths.push(subdivision);
				lengthSoFar += subdivision;
			}
			length = lengthSoFar;
			break;
		}

		let numBlocks = lengths.length;
		const longProbability = this.longNoteProbability;
		let noteValues = [];
		if (timeSignatureType === TimeSignatureType.SIMPLE) {
			if (numBlocks === 2) {
				noteValues = [[1], [1]];
			} else {
				let i = 0;
				while (i < numBlocks - 1) {
					if (Math.random() < longProbability) {
						// Replace two 1s with one 2.
						lengths.splice(i, 2, 2);
						numBlocks--;
						noteValues[i] = [2];
					} else {
						noteValues[i] = [1];
					}
					i++;
				}
				if (noteValues.length < numBlocks) {
					noteValues.push([1]);
				}
			}
		} else if (numBlocks === 1) {
			const beats = new Array(lengths[0]);
			beats.fill(1);
			noteValues[0] = beats;
		} else {
			for (let i = 0; i < numBlocks; i++) {
				const subdivision = lengths[i];
				let beats;
				if (Math.random() < longProbability) {
					beats = [subdivision];
				} else {
					beats = new Array(subdivision);
					beats.fill(1);
				}
				noteValues[i] = beats;
			}
		}

		// Use negative "beat lengths" to indicate rests.
		let restsToAllocate = Math.round(cdfLookup(this.restTimeDist) * length / 16);
		let attempts = 0;
		while (restsToAllocate > 0 && attempts < 100) {
			const index = Math.trunc(Math.random() * length);
			let currentIndex = 0;
			for (let i = 0; i < numBlocks; i++) {
				const blockLength = lengths[i];
				if (index < currentIndex + blockLength) {
					let indexWithinBlock = index - currentIndex;
					const beats = noteValues[i];
					const beatLength = beats[indexWithinBlock];
					if ((indexWithinBlock !== 0 || (beats.length === 1 && i !== 0)) && beatLength > 0) {
						beats[indexWithinBlock] = -beatLength;
						restsToAllocate -= beatLength;
					}
					break;
				}
				currentIndex += blockLength;
			}
			attempts++;
		}
		for (let i = 0; i < numBlocks && restsToAllocate < 0; i++) {
			const beatGroup = noteValues[i];
			for (let j = 0; j < beatGroup.length && restsToAllocate < 0; j++) {
				const beat = beatGroup[j];
				if (beat < 0 && -beat <= -restsToAllocate) {
					beatGroup[j] = -beat;
					restsToAllocate += -beat;
				}
			}
		}

		console.log('Blocks: ' + lengths);
		console.log('Rhythm: ' + noteValues.flat());

		const phrase = new Sequencer.Phrase('Generated', length * 2);
		const parameterMaps = new Array(3);
		for (let i = 0; i < 3; i++) {
			const parameterMap = new Map();
			parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, Synth.Gate.TRIGGER));
			parameterMap.set(Synth.Param.DURATION, new Synth.Change(Synth.ChangeType.SET, (i + 1) * 1.5));
			parameterMaps[i] = parameterMap;
		}

		let rowNum = 0;
		for (let i = 0; i < numBlocks; i++) {
			const beatGroup = noteValues[i];
			for (let j = 0; j < beatGroup.length; j++) {
				const beatLength = beatGroup[j];
				if (beatLength > 0) {
					phrase.rows[rowNum] = parameterMaps[beatLength - 1];
				}
				rowNum += Math.abs(beatLength) * 2;
			}
		}
		const lastParams = new Map();
		let numLoops = Math.round(64 / length);
		if (numLoops < 2) {
			numLoops = 2;
		}
		lastParams.set(Synth.Param.LOOP, new Synth.Change(Synth.ChangeType.SET, numLoops));
		phrase.rows[length * 2 - 1] = lastParams;
		return phrase;
	}

}
