'use strict';

class PulseWidthModulationProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [{
			name: 'width',
			defaultValue: 0.5
		}];
	}

	constructor() {
		super();
	}

	process(inputs, outputs, parameters) {
		const widths = parameters.width;
		const input = inputs[0][0];
		const output = outputs[0][0];
		const length = input.length;
		let threshold;

		if (widths.length === 1) {
			threshold = 1 - 2 * widths[0];
			for (let i = 0; i < length; i++) {
				if (input[i] >= threshold) {
					output[i] = 1;
				} else {
					output[i] = 0;
				}
			}
		} else {
			for (let i = 0; i < length; i++) {
				threshold = 1 - 2 * widths[i];
				if (input[i] >= threshold) {
					output[i] = 1;
				} else {
					output[i] = 0;
				}
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
