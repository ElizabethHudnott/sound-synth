(function (global) {
'use strict';

const NEARLY_ZERO = 1 / 65535;
const CENT = 2 ** (1 / 1200);

const LFO_MAX = 25;
const TIME_STEP = 0.02; // 50 steps per second

function clamp(value) {
	if (value > LFO_MAX) {
		return LFO_MAX;
	} else if (value < -LFO_MAX) {
		return -LFO_MAX;
	} else {
		return value;
	}
}

function volumeCurve(value) {
	if (value === 0) {
		return 0;
	} else {
		return 10 ** (-2 * (100 - value) / 99);
	}
}

const Parameter = Object.freeze({
	ATTACK: 0,		// in milliseconds
	DECAY: 1,		// in milliseconds
	RELEASE: 2,		// in milliseconds
	DURATION: 3,	// in milliseconds
	VELOCITY: 4,	// percentage
	SUSTAIN: 5,		// percentage
	GATE: 6,		// CLOSED, OPEN, TRIGGER, RETRIGGER or CUT
	WAVEFORM: 7,	// 'sine', 'square', 'sawtooth' or 'triangle'
	FREQUENCY: 8,	// in hertz
	NOTE: 9,		// MIDI note number
	DETUNE: 10,		// in cents
	VIBRATO_WAVEFORM: 11, // 'sine', 'square', 'sawtooth' or 'triangle'
	VIBRATO_RATE: 12, // in hertz
	VIBRATO_EXTENT: 13, // in cents
	VOLUME: 14,		// percentage
	TREMOLO_WAVEFORM: 15, // 'sine', 'square', 'sawtooth' or 'triangle'
	TREMOLO_FREQUENCY: 16, // in hertz
	TREMOLO_AMOUNT: 17, // percentage
	PANNED: 18,		// 0 or 1
	SOURCE: 19,		// Combinations of Source enum values
	MIX: 20,		// Relative volumes
	PULSE_WIDTH: 21,// percentage
	FILTERED_AMOUNT: 22, // percentage
	FILTER_TYPE: 23, // 'lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'lowshelf', 'highshelf' or 'peaking'
	FILTER_FREQUENCY: 24, // in hertz
	FILTER_Q: 25,	// 0.0001 to 1000
	FILTER_GAIN: 26, // -40dB to 40dB
	RETRIGGER: 27,	// in steps
	RING_MODULATION: 28, // 0 to 1
});

const ChangeType = Object.freeze({
	SET: 'setValueAtTime',
	LINEAR: 'linearRampToValueAtTime',
	EXPONENTIAL: 'exponentialRampToValueAtTime',
	DELTA: '+',		//standalone or prefixed before LINEAR or EXPONENTIAL
	MULTIPLY: '*',	//standalone or prefixed before LINEAR or EXPONENTIAL
	MARK: '=',
});

class Change {
	constructor(type, value) {
		this.type = type;
		this.value = value;
	}
}

const Gate = Object.freeze({
	CLOSED: 0,
	OPEN: 1,
	TRIGGER: 2,
	RETRIGGER: 3,
	CUT: 4,
});

const Source = Object.freeze({
	OSCILLATOR: 1,
	PULSE: 2,
	NOISE: 4,
	SAMPLE: 8
});

const noteFrequencies = [];

for (let i = 0; i <= 127; i++) {
	noteFrequencies[i] = 2 ** ((i - 69) / 12) * 440;
}

class Modulator {
	constructor(audioContext, carrier) {
		this.carriers = [carrier];

		const oscillator = audioContext.createOscillator();
		this.oscillator = oscillator;
		oscillator.frequency.value = 5;

		const gain = audioContext.createGain();
		this.gain = gain;
		gain.gain.value = 0;
		oscillator.connect(gain);
		gain.connect(carrier);
	}

	start(when) {
		this.oscillator.start(when);
	}

	setMinMax(changeType, min, max, time) {
		const multiplier = (max - min) / 2;
		const centre = min + multiplier;
		this.gain.gain[changeType](multiplier, time);

		for (let carrier of this.carriers) {
			carrier[changeType](centre, time);
		}
	}

	setRange(changeType, range, time) {
		this.gain.gain[changeType](range, time);
	}

	setCentre(changeType, centre, time) {
		for (let carrier of this.carriers) {
			carrier[changeType](centre, time);
		}
	}

	connect(carrier) {
		this.gain.connect(carrier);
		const carriers = this.carriers;
		if (!carriers.includes(carrier)) {
			if (carriers.length > 0) {
				carrier.value = carriers[0].value;
			}
			this.carriers.push(carrier);
		}
	}

	disconnect(carrier) {
		const index = this.carriers.indexOf(carrier);
		if (index !== -1) {
			this.gain.disconnect(carrier);
			this.carriers.splice(index, 1);
		}
	}
}

class SynthSystem {
	constructor(audioContext, callback) {
		const me = this;
		this.audioContext = audioContext;
		this.shortestTime = 1 / audioContext.sampleRate;
		this.retriggerDelay = 0.002;
		this.startTime = audioContext.currentTime;
		this.channels = [];

		const volume = audioContext.createGain();
		this.volume = volume;
		volume.connect(audioContext.destination);

		this.timerFunc = function () {
			const now = me.audioContext.currentTime + 0.001;
			const step = Math.round((now - me.startTime) / TIME_STEP);
			const channels = me.channels;
			const numChannels = channels.length;

			for (let channel of channels) {
				const retriggerRate = channel.retriggerRate;
				if (retriggerRate !== 0 && step % retriggerRate === 0) {
					channel.gate(Gate.RETRIGGER, now);
				}
			}
		}
		this.timer = undefined;
		this.installTimer = function () {
			me.timer = setInterval(me.timerFunc, TIME_STEP * 1000);
		};

		audioContext.audioWorklet.addModule('audioworkletprocessors.js').then(function () {
			if (callback !== undefined) {
				callback(me);
			}
		});
	}

	addChannel(channel) {
		this.channels.push(channel);
	}

	begin() {
		const now = this.audioContext.currentTime;
		const startTime = this.startTime;
		const step = Math.trunc((now - startTime) / TIME_STEP);
		this.startTime = startTime + (step + 1) * TIME_STEP;
	}

	start() {
		clearInterval(this.timer);
		const now = this.audioContext.currentTime;
		const startTime = (Math.trunc(now / TIME_STEP) + 1) * TIME_STEP;
		setTimeout(this.installTimer, (startTime - now) * 1000);

		for (let channel of this.channels) {
			channel.start(startTime);
		}
		this.startTime = startTime;
	}

}

class NoiseNode extends AudioWorkletNode {
	constructor(context) {
		super(context, 'noise-generation-processor', {numberOfInputs: 0});
	}

	get frequency() {
		return this.parameters.get('frequency');
	}
}

class PulseNode extends AudioWorkletNode {
	constructor(context) {
		super(context, 'pulse-width-modulation-processor', {numberOfInputs: 0});
	}

	get frequency() {
		return this.parameters.get('frequency');
	}

	get width() {
		return this.parameters.get('width');
	}
}
class SubtractiveSynthChannel {
	constructor(system, pannedLeft) {
		const audioContext = system.audioContext;
		this.system = system;
		this.parameters = [
			2,		// attack
			50,		// decay
			300,	// release
			200,	// duration
			100,	// velocity
			50,		// sustain
			Gate.CLOSED, // gate
			'sine',	// waveform
			440,	// frequency
			69,		// MIDI note number
			0,		// detune
			'sine',	// vibrato shape
			5,		// vibrato rate
			0,		// vibrato extent
			100,	//	volume
			'sine', // tremolo shape
			5,		// tremolo frequency
			0,		// tremolo amount
			0,		// pan
			Source.OSCILLATOR,
			[100, 100, 100], // relative proportions of the different sources
			50,		// pulse width
			100,	// filter fully enabled
			'lowpass', // filter type
			4400,	// filter frequency
			1,		// filter Q
			0,		// filter gain
			0,		// retrigger time (steps)
			0,		// ring modulation
		];
		this.velocity = 1;
		this.sustain = volumeCurve(50); // combined sustain and velocity
		this.calcEnvelope(3)
		this.retriggerRate = 0;

		const oscillator = audioContext.createOscillator();
		this.oscillator = oscillator;
		const oscillatorGain = audioContext.createGain();
		oscillator.connect(oscillatorGain);

		const pwm = new PulseNode(audioContext);
		this.pwm = pwm;
		const pwmGain = audioContext.createGain();
		pwmGain.gain.value = 0;
		pwm.connect(pwmGain);

		const noise = new NoiseNode(audioContext);
		this.noise = noise;
		const noiseGain = audioContext.createGain();
		noiseGain.gain.value = 0;
		noise.connect(noiseGain);

		const vibrato = new Modulator(audioContext, oscillator.frequency);
		this.vibrato = vibrato;
		vibrato.connect(pwm.frequency);
		vibrato.connect(noise.frequency);

		const ringMod = audioContext.createGain();
		const ringInput = audioContext.createGain();
		ringInput.connect(ringMod.gain);
		ringInput.gain.value = 0;
		this.ringMod = ringMod;
		this.ringInput = ringInput;

		oscillatorGain.connect(ringMod);
		pwmGain.connect(ringMod);
		noiseGain.connect(ringMod);
		this.gains = [oscillatorGain, pwmGain, noiseGain];

		const envelope = audioContext.createGain();
		this.envelope = envelope;
		envelope.gain.value = 0;
		ringMod.connect(envelope);

		const filter = audioContext.createBiquadFilter();
		this.filter = filter;
		filter.frequency.value = 4400;

		const filteredPath = audioContext.createGain();
		this.filteredPath = filteredPath;
		envelope.connect(filteredPath);
		filteredPath.connect(filter);

		const unfilteredPath = audioContext.createGain();
		this.unfilteredPath = unfilteredPath;
		unfilteredPath.gain.value = 0;
		envelope.connect(unfilteredPath);

		const tremoloGain = audioContext.createGain();
		const tremoloModulator = new Modulator(audioContext, tremoloGain.gain);
		this.tremolo = tremoloModulator;
		filter.connect(tremoloGain);
		unfilteredPath.connect(tremoloGain);

		const panner = audioContext.createStereoPanner();
		this.panner = panner;
		this.panValue = pannedLeft? -1 : 1;
		tremoloGain.connect(panner);

		const volume = audioContext.createGain();
		this.volume = volume;
		panner.connect(volume);

		volume.connect(system.volume);
		system.addChannel(this);
	}

	connect(channel) {
		const node = channel.ringInput;
		this.filter.connect(node);
		this.unfilteredPath.connect(node);
	}

	start(when) {
		if (!this.started) {
			this.oscillator.start(when);
			this.vibrato.start(when);
			this.tremolo.start(when);
			this.started = true;
		}
	}

	calcEnvelope(dirty) {
		const params = this.parameters;

		if (dirty & 1) {
			const endAttack = params[Parameter.ATTACK];
			const endDecay = endAttack + params[Parameter.DECAY];
			this.endAttack = endAttack / 1000;
			this.endDecay = endDecay / 1000;
		}
		if (dirty & 2) {
			const duration = params[Parameter.DURATION];
			const release = params[Parameter.RELEASE];
			const endRelease = duration + release;
			this.release = release / 1000;
			this.beginRelease = duration / 1000;
			this.endRelease = endRelease / 1000;
		}
	}

	calcGains(changeType, when) {
		let voices = this.parameters[Parameter.SOURCE];
		const mix = this.parameters[Parameter.MIX];
		let total = 0;
		for (let level of mix) {
			if ((voices & 1) == 1) {
				total += level;
			}
			voices = voices>>1;
		}
		if (total < 100) {
			total = 100;
		}
		const unit = 1 / total;
		const gains = this.gains;
		voices = this.parameters[Parameter.SOURCE];
		for (let i = 0; i < mix.length; i++) {
			let param = gains[i].gain;
			if ((voices & 1) === 1) {
				param[changeType](unit * mix[i], when);
			} else {
				param[changeType](NEARLY_ZERO, when - this.system.shortestTime);
				param.setValueAtTime(0, when);
			}
			voices = voices>>1;
		}
	}

	gate(state, start) {
		const sustainLevel = this.sustain;
		let endDecay, beginRelease, endTime;

		const gain = this.envelope.gain;
		gain.cancelAndHoldAtTime(start);

		switch (state) {
		case Gate.OPEN:
			gain.linearRampToValueAtTime(this.velocity, start + this.endAttack);
			gain.linearRampToValueAtTime(sustainLevel, start + this.endDecay);
			break;

		case Gate.CLOSED:
			endTime = start + this.release;
			gain.exponentialRampToValueAtTime(NEARLY_ZERO, endTime - this.system.shortestTime);
			gain.setValueAtTime(0, endTime);
			break;

		case Gate.TRIGGER:
			gain.linearRampToValueAtTime(this.velocity, start + this.endAttack);
			endDecay = start + this.endDecay;
			gain.linearRampToValueAtTime(sustainLevel, endDecay);
			beginRelease = start + this.beginRelease;
			if (endDecay < beginRelease) {
				gain.linearRampToValueAtTime(sustainLevel, beginRelease);
			} else {
				gain.cancelAndHoldAtTime(beginRelease);
			}
			endTime = start + this.endRelease;
			gain.exponentialRampToValueAtTime(NEARLY_ZERO, endTime - this.system.shortestTime);
			gain.setValueAtTime(0, endTime);
			break;

		case Gate.RETRIGGER:
			const retriggerDelay = this.system.retriggerDelay;
			gain.linearRampToValueAtTime(0, start + retriggerDelay);
			gain.linearRampToValueAtTime(this.velocity, start + this.endAttack + retriggerDelay);
			endDecay = start + this.endDecay + retriggerDelay;
			gain.linearRampToValueAtTime(sustainLevel, endDecay);
			beginRelease = start + this.beginRelease + retriggerDelay;
			if (endDecay < beginRelease) {
				gain.linearRampToValueAtTime(sustainLevel, beginRelease);
			} else {
				gain.cancelAndHoldAtTime(beginRelease);
			}
			endTime = start + this.endRelease + retriggerDelay;
			gain.exponentialRampToValueAtTime(NEARLY_ZERO, endTime - this.system.shortestTime);
			gain.setValueAtTime(0, endTime);
			break;

		case Gate.CUT:
			gain.setValueAtTime(0, start);
			break;

		}
	}

	setFrequency(changeType, frequency, when) {
		const vibratoExtent = CENT ** (this.parameters[Parameter.VIBRATO_EXTENT] / 2);
		this.vibrato.setMinMax(changeType, frequency / vibratoExtent, frequency * vibratoExtent, when);
	}

	setDetune(changeType, cents, when) {
		this.oscillator.detune[changeType](cents, when);
	}

	setParameters(parameterMap, step) {
		const me = this;
		const parameters = this.parameters;
		let gate = parameterMap.get(Parameter.GATE);
		if (gate !== undefined) {
			gate = gate.value;
		}

		let dirtyEnvelope = 0;
		let dirtySustain = false;
		let gainChange;

		const time = this.system.startTime + Math.trunc(step) * TIME_STEP;
		const now = this.system.audioContext.currentTime;
		const timeDifference = Math.round((time - now) * 1000);
		const callbacks = [];

		for (let [paramNumber, change] of parameterMap) {
			let changeType = change.type;
			let prefix, value;
			if (changeType === ChangeType.MARK) {
				value = parameters[paramNumber];
				changeType = ChangeType.SET;
				prefix = '';
			} else {
				value = change.value;
				prefix = changeType[0];
			}
			let frequency;

			if (paramNumber === Parameter.MIX) {

				const mix = parameters[Parameter.MIX]
				if (prefix === ChangeType.DELTA) {
					for (let i = 0; i < value.length; i++) {
						mix[i] = mix[i] + value[i];
					}
					changeType = changeType.slice(1);
				} else {
					for (let i = 0; i < value.length; i++) {
						mix[i] = value[i];
					}
				}

			} else {

				if (prefix === ChangeType.DELTA) {
					value += parameters[paramNumber];
					changeType = changeType.slice(1);
				} else if (prefix === ChangeType.MULTIPLY) {
					value *= parameters[paramNumber];
					changeType = changeType.slice(1);
				}
				parameters[paramNumber] = value;

			}

			if (changeType === "") {
				changeType = ChangeType.SET;
			}

			switch (paramNumber) {
			case Parameter.ATTACK:
			case Parameter.DECAY:
				dirtyEnvelope = dirtyEnvelope | 1;
				break;

			case Parameter.RELEASE:
			case Parameter.DURATION:
				dirtyEnvelope = dirtyEnvelope | 2;
				break;

			case Parameter.VELOCITY:
				this.velocity = volumeCurve(value);
				dirtySustain = true;
				break;

			case Parameter.SUSTAIN:
				dirtySustain = true;
				break;

			case Parameter.WAVEFORM:
				if (timeDifference > 0) {
					callbacks.push(function () {
						me.oscillator.type = value;
					});
				} else {
					this.oscillator.type = value;
				}
				break;

			case Parameter.VIBRATO_WAVEFORM:
				if (timeDifference > 0) {
					callbacks.push(function () {
						me.vibrato.oscillator.type = value;
					});
				} else {
					this.vibrato.oscillator.type = value;
				}
				break;

			case Parameter.TREMOLO_WAVEFORM:
				if (timeDifference > 0) {
					callbacks.push(function () {
						me.tremolo.oscillator.type = value;
					});
				} else {
					this.tremolo.oscillator.type = value;
				}
				break;

			case Parameter.FREQUENCY:
				this.setFrequency(changeType, value, time);
				break;

			case Parameter.NOTE:
				frequency = noteFrequencies[value];
				this.setFrequency(changeType, frequency, time);
				parameters[Parameter.FREQUENCY] = frequency;
				break;

			case Parameter.VIBRATO_EXTENT:
				this.setFrequency(changeType, parameters[Parameter.FREQUENCY], time);
				break;

			case Parameter.DETUNE:
				this.setDetune(changeType, value, time);
				break;

			case Parameter.VOLUME:
				this.volume.gain[changeType](volumeCurve(value), time);
				break;

			case Parameter.VIBRATO_RATE:
				value = clamp(value);
				this.vibrato.oscillator.frequency[changeType](value, time);
				parameters[Parameter.VIBRATO_FREQUENCY] = value;
				break;

			case Parameter.TREMOLO_FREQUENCY:
				value = clamp(value);
				this.tremolo.oscillator.frequency[changeType](value, time);
				parameters[Parameter.TREMOLO_FREQUENCY] = value;
				break;

			case Parameter.TREMOLO_AMOUNT:
				this.tremolo.setMinMax(changeType, 1 - value / 100, 1, time);
				break;

			case Parameter.PANNED:
				value = Math.trunc(Math.abs(value)) % 2;
				this.panner.pan.setValueAtTime(value * this.panValue, time);
				parameters[Parameter.PANNED] = value;
				break;

			case Parameter.SOURCE:
			case Parameter.MIX:
				gainChange = changeType;
				break;

			case Parameter.PULSE_WIDTH:
				this.pwm.width[changeType](value / 100, time);
				break;

			case Parameter.FILTERED_AMOUNT:
				this.filteredPath.gain[changeType](value / 100, time);
				this.unfilteredPath.gain[changeType](1 - value / 100, time);
				break;

			case Parameter.FILTER_TYPE:
				if (timeDifference > 0) {
					callbacks.push(function () {
						me.filter.type = value;
					});
				} else {
					this.filter.type = value;
				}
				break;

			case Parameter.FILTER_FREQUENCY:
				this.filter.frequency[changeType](value, time);
				break;

			case Parameter.FILTER_Q:
				this.filter.Q[changeType](value, time);
				break;

			case Parameter.FILTER_GAIN:
				this.filter.gain[changeType](value, time);
				break;

			case Parameter.RETRIGGER:
				if (timeDifference > 0) {
					if (gate !== Gate.CLOSED && gate !== Gate.CUT) {
						callbacks.push(function () {
							me.retriggerRate = value;
						});
					}
				} else {
					this.retriggerRate = value;
				}
				break;

			case Parameter.RING_MODULATION:
				this.ringMod.gain[changeType](1 - value / 100, time);
				this.ringInput.gain[changeType](value / 100, time);
				break;

			} // end switch
		} // end loop over each parameter

		if (gainChange !== undefined) {
			this.calcGains(gainChange, time);
		}
		if (dirtyEnvelope) {
			this.calcEnvelope(dirtyEnvelope);
		}
		if (dirtySustain) {
			this.sustain = volumeCurve(parameters[Parameter.VELOCITY] * parameters[Parameter.SUSTAIN] / 100);
		}
		if (gate !== undefined) {
			this.gate(gate, time);

			if ((gate === Gate.CLOSED || gate === Gate.CUT) && this.retriggerRate !== 0) {
				callbacks.push(function () {
					me.retriggerRate = 0;
				});
			}
		}

		const numCallbacks = callbacks.length;
		if (numCallbacks > 0) {
			if (numCallbacks === 1) {
				setTimeout(callbacks[0], timeDifference);
			} else {
				setTimeout(function () {
					for (let callback of callbacks) {
						callback();
					}
				}, timeDifference);
			}
		}
	}

}

global.Synth = {
	Change: Change,
	SubtractiveSynthChannel: SubtractiveSynthChannel,
	System: SynthSystem,
	ChangeType: ChangeType,
	Gate: Gate,
	Param: Parameter,
	Source: Source,
	Modulator: Modulator,
	NoiseNode: NoiseNode,
	PulseNode: PulseNode,
	noteFrequencies: noteFrequencies,
};

})(window);
