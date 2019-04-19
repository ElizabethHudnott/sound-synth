'use strict';

class PulseWidthModulationProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [
		{
			name: 'frequency',
			automationRate: 'k-rate',
			defaultValue: 440,
			minValue: Number.EPSILON,
			maxValue: sampleRate / 2,
		},
		{
			name: 'width',
			automationRate: 'k-rate',
			defaultValue: 0.5,
			minValue: 0,
			maxValue: 1,
			}
		];
	}

	constructor() {
		super();
		this.outputLevel = 1;
		this.plateauLength = 0;
	}

	process(inputs, outputs, parameters) {
		const output = outputs[0][0];
		const period = sampleRate / parameters.frequency[0];
		const lengths = [Math.round(parameters.width[0] * period), undefined];
		lengths[2]  = Math.round(period) - lengths[0];

		let outputLevel = this.outputLevel;
		let plateauLength = this.plateauLength;
		let targetLength = lengths[1 - outputLevel];
		for (let i = 0; i < 128; i++) {
			if (plateauLength >= targetLength) {
				outputLevel = outputLevel * -1;
				plateauLength = 0;
				targetLength = lengths[1 - outputLevel];
			}
			output[i] = outputLevel;
			plateauLength++;
		}

		this.outputLevel = outputLevel;
		this.plateauLength = plateauLength;
		return true;
	}
}

registerProcessor('pulse-width-modulation-processor', PulseWidthModulationProcessor);

class NoiseGenerationProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [{
			name: 'frequency',
			automationRate: 'k-rate',
			defaultValue: 440,
			minValue: Number.EPSILON,
			maxValue: sampleRate / 2,
		}];
	}

	constructor() {
		super();
		this.outputLevel = Math.random() * 2 - 1;
		this.plateauLength = 0;
	}

	process(inputs, outputs, parameters) {
		const output = outputs[0][0];
		const targetLength = Math.round(sampleRate / (2 * parameters.frequency[0]));

		let outputLevel = this.outputLevel;
		let plateauLength = this.plateauLength;
		for (let i = 0; i < 128; i++) {
			if (plateauLength >= targetLength) {
				outputLevel = Math.random() * 2 + 1;
				plateauLength = 0;
			}
			output[i] = outputLevel;
			plateauLength++;
		}

		this.outputLevel = outputLevel;
		this.plateauLength = plateauLength;
		return true;
	}

}

registerProcessor('noise-generation-processor', NoiseGenerationProcessor);
