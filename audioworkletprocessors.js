'use strict';

class WavetableProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [{
			name: 'position',
			minValue: 0
		}];
	}

	process(inputs, outputs, parameters) {
		const numInputs = inputs.length;
		const output = outputs[0][0];
		const positions = parameters.position;

		if (positions.length === 1) {
			const position = positions[0] % numInputs;
			const lowerPosition = Math.trunc(position);
			const upperPosition = (lowerPosition + 1) % numInputs;
			const lowerWave = inputs[lowerPosition][0];
			const upperWave = inputs[upperPosition][0];
			const upperPortion = position - lowerPosition;
			const lowerPortion = 1 - upperPortion;
			for (let i = 0; i < 128; i++) {
				output[i] = lowerPortion * lowerWave[i] + upperPortion * upperWave[i];
			}
		} else {
			for (let i = 0; i < 128; i++) {
				const position = positions[i] % numInputs;
				const lowerPosition = Math.trunc(position);
				const upperPosition = (lowerPosition + 1) % numInputs;
				const lowerWave = inputs[lowerPosition][0];
				const upperWave = inputs[upperPosition][0];
				const upperPortion = position - lowerPosition;
				const lowerPortion = 1 - upperPortion;
				output[i] = lowerPortion * lowerWave[i] + upperPortion * upperWave[i];
			}
		}
		return true;
	}
}

registerProcessor('wavetable-processor', WavetableProcessor);

class ReciprocalProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [];
	}

	process(inputs, outputs) {
		const input = inputs[0][0];
		const output = outputs[0][0];

		for (let i = 0; i < 128; i++) {
			output[i] = 1 / input[i];
		}
		return true;
	}
}

registerProcessor('reciprocal-processor', ReciprocalProcessor);

class SampleAndHoldProcessor extends AudioWorkletProcessor {
 	static get parameterDescriptors() {
 		return [{
 			name: 'frequency',
 			automationRate: 'k-rate',
 			defaultValue: sampleRate,
 			minValue: 0,
 			maxValue: sampleRate,
 		}];
 	}

 	constructor() {
 		super();
 		this.sample = new Float32Array(2);
 		this.timeHeld = 0;
 	}

 	process(inputs, outputs, parameters) {
 		const input = inputs[0];
 		const numChannels = input.length;
 		const output = outputs[0];
 		const frequency = parameters.frequency[0];
 		const sample = this.sample;
 		let inputChannel, outputChannel, timeHeld;

 		if (frequency === sampleRate) {
 			for (let j = 0; j < numChannels; j++) {
 				inputChannel = input[j];
 				output[j].set(inputChannel);
 				sample[j] = inputChannel[127];
 			}
 			this.timeHeld = 0;
 			return true;
 		}

 		const holdTime = sampleRate / frequency;

 		for (let j = 0; j < numChannels; j++) {
 			inputChannel = input[j];
 			outputChannel = output[j];
	 		timeHeld = this.timeHeld;
	 		for (let i = 0; i < 128; i++) {
	 			timeHeld++;
	 			if (timeHeld >= holdTime) {
					sample[j] = inputChannel[i];
	 				timeHeld -= holdTime;
	 			}
				outputChannel[i] = sample[j];
	 		}
	 	}

 		this.timeHeld = timeHeld;
 		return true;
 	}

 }

registerProcessor('sample-and-hold-processor', SampleAndHoldProcessor);
