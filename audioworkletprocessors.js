'use strict';

const TWO24 = 1<<24;
const TWO23 = 1<<23;
const MAX24 = (1<<24) - 1;
const NOISE_BIT = 1<<22;

class C64OscillatorProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [
		{
			name: 'frequency',
			automationRate: 'k-rate',
			defaultValue: 440,
			minValue: 1,
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
		this.type = 1; // 1 = triangle, 2 = sawtooth, 4 = pulse, 8 = noise
		this.accumulator = 0;
		this.random = Math.random() * 2 - 1;
		const me = this;
		this.port.onmessage = function (event) {
			me.type = event.data;
		}
	}

	process(inputs, outputs, parameters) {
		const output = outputs[0][0];
		const frequency = parameters.frequency[0];
		const step = Math.round((TWO24 / sampleRate) * frequency);
		const width = parameters.width[0];
		const threshold = Math.round(MAX24 * width);
		const type = this.type;
		let accumulator = this.accumulator;

		if ((type & 8) === 0) {
			for (let i = 0; i < 128; i++) {
				accumulator = (accumulator + step) % TWO24;
				let value = MAX24;
				if ((type & 1) === 1) {
					// triangle
					if ((accumulator & TWO23) === 0) {
						value = value & ((accumulator & 8388607) << 1);
					} else {
						value = value & ((accumulator ^ 8388607) << 1);
					}
				}
				if ((type & 2) === 2) {
					// sawtooth
					value = value & accumulator;
				}
				if ((type & 4) === 4) {
					// pulse
					if (accumulator < threshold) {
						value = 0;
					}
				}
				output[i] = value / TWO23 - 1;
			}
		} else {
			let prevBIT = accumulator & NOISE_BIT;
			let random = this.random;
			let thisBIT;
			for (let i = 0; i < 128; i++) {
				accumulator = (accumulator + step) % TWO24;
				thisBIT = accumulator & NOISE_BIT;
				if (prevBIT != thisBIT) {
					random = Math.random() * 2 - 1;
				}
				output[i] = random;
				prevBIT = thisBIT;
			}
			this.random = random;
		}

		this.accumulator = accumulator;
		return true;
	}
}

registerProcessor('c64-oscillator-processor', C64OscillatorProcessor);

class LogProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [{
			name: 'steps',
			automationRate: 'k-rate',
			defaultValue: 3,
			minValue: 1,
			maxValue: 128,
		}];
	}

	process(inputs, outputs, parameters) {
		const input = inputs[0][0];
		const steps = parameters.steps[0];
		const step = Math.round(128 / steps);
		for (let i = 0; i < steps; i++) {
			console.log(input[i * step]);
		}
	}
}

registerProcessor('log-processor', LogProcessor);
