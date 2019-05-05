'use strict';

const TWO24 = 1<<24;
const TWO23 = 1<<23;
const MAX24 = (1<<24) - 1;
const NOISE_BIT = 1<<22;
const RATIO = TWO24 / sampleRate;

class C64OscillatorProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [
			{
				name: 'frequency',
				defaultValue: 440,
				minValue: 1 / RATIO,
				maxValue: sampleRate / 2,
			},
			{
				name: 'width',
				defaultValue: 0.5,
				minValue: 0,
				maxValue: 1,
			},
			{
				name: 'sync',
				defaultValue: 0,
			}
		];
	}

	constructor() {
		super();
		this.type = 1; // 1 = triangle, 2 = sawtooth, 4 = pulse, 8 = noise
		this.accumulator = 0;
		this.random = Math.random() * 2 - 1;
		this.prevSync = 0;
		const me = this;
		this.port.onmessage = function (event) {
			me.type = event.data;
		}
	}

	process(inputs, outputs, parameters) {
		const output = outputs[0][0];
		const accumulatorOutput = outputs[1][0];
		const frequency = parameters.frequency;
		const width = parameters.width;
		const sync = parameters.sync;
		const type = this.type;
		const constantSync = sync.length === 1;

		let accumulator = this.accumulator;
		let prevSync = this.prevSync;

		let step, threshold
		let constantFrequency = false, constantWidth = false;
		if (frequency.length === 1) {
			constantFrequency = true;
			step = Math.round(RATIO * frequency[0]);
		}
		if (width.length === 1) {
			constantWidth = true;
			threshold = Math.round(MAX24 * width[0]);
		}

		if ((type & 8) === 0) {
			for (let i = 0; i < 128; i++) {
				if (!constantFrequency) {
					step = Math.round(RATIO * frequency[i]);
				}
				if (!constantSync && prevSync > sync[i]) {
					accumulator = 0;
				} else {
					accumulator = (accumulator + step) % TWO24;
				}
				accumulatorOutput[i] = accumulator;
				let value = MAX24;
				if ((type & 1) === 1) {
					// triangle
					if ((accumulator & TWO23) === 0) {
						value = value & ((accumulator & 8388607) << 1);
					} else {
						value = value & ((accumulator ^ 16777215) << 1);
					}
				}
				if ((type & 2) === 2) {
					// sawtooth
					value = value & accumulator;
				}
				if ((type & 4) === 4) {
					// pulse
					if (!constantWidth) {
						threshold = Math.round(MAX24 * width[i]);
					}
					if (accumulator < threshold) {
						value = 0;
					}
				}
				output[i] = value / TWO23 - 1;
				if (!constantSync) {
					prevSync = sync[i];
				}
			}
		} else {
			let prevBit = accumulator & NOISE_BIT;
			let random = this.random;
			let thisBit;
			for (let i = 0; i < 128; i++) {
				if (!constantFrequency) {
					step = Math.round(RATIO * frequency[i]);
				}
				accumulator = (accumulator + step) % TWO24;
				accumulatorOutput[i] = accumulator;
				thisBit = accumulator & NOISE_BIT;
				if (prevBit != thisBit) {
					random = Math.random() * 2 - 1;
				}
				output[i] = random;
				prevBit = thisBit;
			}
			if (!constantSync) {
				prevSync = sync[127];
			}
			this.random = random;
		}

		this.accumulator = accumulator;
		this.prevSync = prevSync;
		return true;
	}
}

registerProcessor('c64-oscillator-processor', C64OscillatorProcessor);
