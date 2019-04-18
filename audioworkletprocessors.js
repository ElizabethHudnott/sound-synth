'use strict';

class PulseWidthModulationProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [{
			name: 'width',
			automationRate: 'k-rate',
			defaultValue: 0.5,
			minValue: 0,
			maxValue: 1,
		}];
	}

	constructor() {
		super();
	}

	process(inputs, outputs, parameters) {
		const input = inputs[0][0];
		const output = outputs[0][0];
		const length = input.length;
		const threshold = 1 - 2 * parameters.width[0];

		for (let i = 0; i < length; i++) {
			if (input[i] >= threshold) {
				output[i] = 1;
			} else {
				output[i] = 0;
			}
		}

		// To keep the processor alive.
		return true;
	}
}

registerProcessor('pulse-width-modulation-processor', PulseWidthModulationProcessor);

class NoiseGenerationProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [];
	}

	constructor() {
		super();
		this.previousInputLevel = 0;
		this.outputLevel = Math.random() * 2 - 1;
	}

	process(inputs, outputs, parameters) {
		const input = inputs[0][0];
		const output = outputs[0][0];
		const length = input.length;

		let previousInputLevel = this.previousInputLevel;
		let outputLevel = this.outputLevel;

		for (let i = 0; i < length; i++) {
			let level = input[i];
			if ((previousInputLevel <= 0 && level > 0) || (previousInputLevel >= 0 && level < 0)) {
				outputLevel = Math.random() * 2 - 1;
			}
			output[i] = outputLevel;
			previousInputLevel = level;
		}
		this.previousInputLevel = previousInputLevel;
		this.outputLevel = outputLevel;
		return true;
	}

}

registerProcessor('noise-generation-processor', NoiseGenerationProcessor);

class RingModAndSyncProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [
			{
				name: 'modulator',
				defaultValue: 1,
			},
			{
				name: 'ring',
				automationRate: 'k-rate',
				defaultValue: 0,
				minValue: 0,
				maxValue: 1,
			},
			{
				name: 'sync',
				automationRate: 'k-rate',
				defaultValue: 0,
				minValue: 0,
				maxValue: 1,
			},
		];
	}

	constructor() {
		super();
	}

	process(inputs, outputs, parameters) {
		const input = inputs[0][0];
		const output = outputs[0][0];
		const length = input.length;

		const ringMod = Math.trunc(parameters.ring[0]);
		const modulator = parameters.modulator;

		if (modulator.length == 1) {
			for (let i = 0; i < length; i++) {
				if (ringMod) {
					output[i] = input[i] * modulator[0];
				} else {
					output[i] = input[i];
				}
			}
		} else {
			for (let i = 0; i < length; i++) {
				if (ringMod) {
					output[i] = input[i] * modulator[i];
				} else {
					output[i] = input[i];
				}
			}
		}
		return true;
	}

}

registerProcessor('ring-mod-and-sync-processor', RingModAndSyncProcessor);
