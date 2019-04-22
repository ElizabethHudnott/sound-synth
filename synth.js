(function (global) {
'use strict';

const NEARLY_ZERO = 1 / 65535;
const SEMITONE = 2 ** (1 / 12);
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
	NOTES: 9,		// MIDI note number
	DETUNE: 10,		// in cents
	VIBRATO_WAVEFORM: 11, // 'sine', 'square', 'sawtooth' or 'triangle'
	VIBRATO_RATE: 12, // in hertz
	VIBRATO_EXTENT: 13, // in cents
	VOLUME: 14,		// percentage
	TREMOLO_WAVEFORM: 15, // 'sine', 'square', 'sawtooth' or 'triangle'
	TREMOLO_RATE: 16, // in hertz
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
	RING_MODULATION: 27, // 0 to 1
	LINE_TIME: 28,	// in steps
	TICKS: 29, // maximum number of events during a LINE_TIME
	RETRIGGER: 30,	// number of ticks between retriggers
	CHORD_SPEED: 31, // number of ticks between notes of a broken chord
	CHORD_PATTERN: 32,
	GLISSANDO_SIZE: 33, // number of steps
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
	CUT: 1,
	OPEN: 2,
	TRIGGER: 3,
	RETRIGGER: 6,
});

const Source = Object.freeze({
	OSCILLATOR: 1,
	PULSE: 2,
	NOISE: 4,
	SAMPLE: 8
});

const Chord = Object.freeze({
	CYCLE: 0,
	TO_AND_FRO: 1,
	TO_AND_FRO_2: 2,
	RANDOM: 3,
})

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

	cancelAndHoldAtTime(when) {
		this.gain.gain.cancelAndHoldAtTime(when);
		for (let carrier of this.carriers) {
			carrier.cancelAndHoldAtTime(when);
		}
	}
}

class SynthSystem {
	constructor(audioContext, callback) {
		const me = this;
		audioContext.audioWorklet.addModule('audioworkletprocessors.js').then(function () {
			if (callback !== undefined) {
				callback(me);
			}
		});

		this.audioContext = audioContext;
		this.channels = [];
		this.shortestTime = 1 / audioContext.sampleRate;
		this.startTime = audioContext.currentTime;
		this.systemParameters = [Parameter.LINE_TIME, Parameter.TICKS];

		this.retriggerDelay = 0.002;

		const volume = audioContext.createGain();
		this.volume = volume;
		volume.connect(audioContext.destination);
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
		const now = this.audioContext.currentTime;
		const startTime = (Math.trunc(now / TIME_STEP) + 1) * TIME_STEP;

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
			[69],	// MIDI note numbers
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
			0,		// ring modulation
			24,		// line time (125bpm, allegro)
			24,		// number of ticks for broken chords, glissando and retrigger
			0,		// retrigger time (ticks)
			1,		// broken chord speed
			Chord.TO_AND_FRO_2,	// chord pattern
			0,		// glissando length
		];
		this.velocity = 1;
		this.sustain = volumeCurve(50); // combined sustain and velocity
		this.calcEnvelope(3);

		// State information for processing chords
		this.frequencies = [440];
		this.noteIndex = 0;
		this.chordDir = 1;
		this.noteRepeated = false;

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
		this.vibrato.cancelAndHoldAtTime(when);
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
		let dirtyNumTicks = false;
		let frequencySet = false;
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

			if (paramNumber === Parameter.NOTES || paramNumber === Parameter.MIX) {
				const list = parameters[paramNumber];

				if (prefix === ChangeType.DELTA) {
					for (let i = 0; i < value.length; i++) {
						list[i] = list[i] + list[i];
					}
					changeType = changeType.slice(1);
				} else {
					for (let i = 0; i < value.length; i++) {
						list[i] = value[i];
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
				frequencySet = true;
				break;

			case Parameter.NOTES:
				frequency = noteFrequencies[value[0]];
				this.setFrequency(changeType, frequency, time);
				frequencySet = true;
				this.frequencies[0] = frequency;
				parameters[Parameter.FREQUENCY] = frequency;
				for (let i = 1; i < value.length; i++) {
					this.frequencies[i] = noteFrequencies[value[i]];
				}
				this.frequencies.splice(value.length);
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

			case Parameter.TREMOLO_RATE:
				value = clamp(value);
				this.tremolo.oscillator.frequency[changeType](value, time);
				parameters[Parameter.TREMOLO_RATE] = value;
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

			case Parameter.RING_MODULATION:
				this.ringMod.gain[changeType](1 - value / 100, time);
				this.ringInput.gain[changeType](value / 100, time);
				break;

			case Parameter.LINE_TIME:
			case Parameter.TICKS:
				dirtyNumTicks = true;
				break;

			case Parameter.CHORD_PATTERN:
				if (value === Chord.CYCLE) {
					this.chordDir = 1;
				}
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
		if (dirtyNumTicks) {
			const numTicks = parameters[Parameter.TICKS];
			if (numTicks > parameters[Parameter.LINE_TIME]) {
				parameters[Parameter.TICKS] = parameters[Parameter.LINE_TIME];
			} else if (numTicks < 1) {
				parameters[Parameter.TICKS] = 1;
			}
			this.copyParameters([Parameter.LINE_TIME, Parameter.TICKS]);
		}

		const gateOpen = parameters[Parameter.GATE] === Gate.OPEN;
		const frequencies = this.frequencies;
		const numNotes = frequencies.length;
		let glissandoSteps = parameters[Parameter.GLISSANDO_SIZE];
		let glissandoAmount, prevGlissandoAmount, noteIndex, chordDir, noteRepeated;

		if (gate !== undefined) {
			this.gate(gate, time);
			glissandoAmount = 0;
			prevGlissandoAmount = 0;
			noteIndex = 0;
			chordDir = 1;
			noteRepeated = false;
			if (!frequencySet && (numNotes > 1 || glissandoSteps !== 0)) {
				this.setFrequency(ChangeType.SET, frequencies[0], time);
			}
		} else if (gateOpen) {
			// Don't repeat glissando but keep the chords smooth.
			glissandoAmount = glissandoSteps;
			prevGlissandoAmount = glissandoAmount;
			glissandoSteps = 0;
			noteIndex = this.noteIndex;
			chordDir = this.chordDir;
			noteRepeated = this.noteRepeated;
		}

		if ((gate & Gate.OPEN) === Gate.OPEN || gateOpen) {
			// The gate's just been triggered or it's open.
			//TODO handle gate triggered in a previous step but not yet closed.
			const retriggerTicks = parameters[Parameter.RETRIGGER];

			if (glissandoSteps !== 0 || numNotes > 1 || retriggerTicks > 0) {
				const chordTicks = parameters[Parameter.CHORD_SPEED];
				const numTicks = parameters[Parameter.TICKS];
				const tickTime = (parameters[Parameter.LINE_TIME] * TIME_STEP) / numTicks;

				let glissandoPerTick;
				if (glissandoSteps === 0) {
					glissandoPerTick = 0;
				} else if (glissandoSteps > 0) {
				 	glissandoPerTick = (glissandoSteps + 1) / numTicks;
				} else {
					glissandoPerTick = (glissandoSteps - 1) / numTicks;
				}

				let tick = 1;
				const pattern = parameters[Parameter.CHORD_PATTERN];
				while (tick < numTicks) {
					const timeOfTick = time + tick * tickTime;

					if (glissandoSteps > 0) {
						glissandoAmount = Math.trunc(tick * glissandoPerTick);
					}
					let newFrequency = glissandoAmount !== prevGlissandoAmount;
					if (numNotes > 1 && tick % chordTicks === 0) {
						noteIndex = noteIndex + chordDir;
						switch (pattern) {
						case Chord.CYCLE:
							noteIndex = noteIndex % numNotes;
							newFrequency = true;
							break;

						case Chord.TO_AND_FRO:
							if (noteIndex === numNotes) {
								noteIndex = numNotes - 2;
								chordDir = -1;
							} else if (noteIndex === -1) {
								noteIndex = 1;
								chordDir = 1;
							}
							newFrequency = true;
							break;

						case Chord.TO_AND_FRO_2:
							if (noteIndex === numNotes) {
								if (noteRepeated) {
									noteIndex = numNotes - 2;
									chordDir = -1;
									newFrequency = true;
									noteRepeated = false;
								} else {
									noteIndex--;
									noteRepeated = true;
								}
							} else if (noteIndex === -1) {
								if (noteRepeated) {
									noteIndex = 1;
									chordDir = 1;
									newFrequency = true;
									noteRepeated = false;
								} else {
									noteIndex++;
									noteRepeated = true;
								}
							} else {
								newFrequency = true;
							}
							break;

						case Chord.RANDOM:
							const oldNoteIndex = noteIndex - 1;
							noteIndex = Math.trunc(Math.random() * numNotes);
							if (noteIndex !== oldNoteIndex) {
								newFrequency = true;
							}
							break;

						}
					}

					if (newFrequency) {
						const frequency = frequencies[noteIndex] * SEMITONE ** glissandoAmount;
						this.setFrequency(ChangeType.SET, frequency, timeOfTick);
						console.log("Scheduled frequency " + frequency + " at " + timeOfTick);
					}

					if (tick % retriggerTicks === 0) {
						this.gate(Gate.RETRIGGER, timeOfTick);
					}
					prevGlissandoAmount = glissandoAmount;
					tick++;
				}
				this.noteIndex = noteIndex;
				this.chordDir = chordDir;
				this.noteRepeated = noteRepeated;
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

	copyParameters(paramNumbers) {
		const channels = this.system.channels;
		for (let paramNumber of paramNumbers) {
			const value = this.parameters[paramNumber];
			for (let channel of channels) {
				channel.parameters[paramNumber] = value;
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
	Pattern: Chord,
	Param: Parameter,
	Source: Source,
	Modulator: Modulator,
	NoiseNode: NoiseNode,
	PulseNode: PulseNode,
	noteFrequencies: noteFrequencies,
};

})(window);
