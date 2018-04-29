(function() {
	// utility methods
	var getByClass = function(className, parentNode) {
		return (parentNode === undefined ? document : parentNode).getElementsByClassName(className)[0];
	};

	// model
	var initialSettingsLoaded = false;

	var trackModel = function(name, length) {
		var This = this;
		This.name = name;
		This.length = length;
	};

	var standardTracks = [
			new trackModel("Track 1", 90),
			new trackModel("Track 2", 107),
			new trackModel("Track 3", 67),
			new trackModel("Track 4", 24530),
			new trackModel("Track 5", 1337)],
		rainbowTracks = [
			new trackModel("Rainbows 1", 600),
			new trackModel("Rainbows 2", 177),
			new trackModel("Rainbows 3", 1084)];

	var playbackModel = function() {
		var This = this;
		This.redMin = 0;
		This.redMax = 255;
		This.redInvert = false;
		This.greenMin = 0;
		This.greenMax = 255;
		This.greenInvert = false;
		This.blueMin = 0;
		This.blueMax = 255;
		This.blueInvert = false;
		This.brightness = 255;
		This.frameSkip = 0;
		This.frameStretch = 0;
		This.videoDirectory = 0;
		This.videoSecondsElapsed = 0;
		This.videoIndex = 0;
	};

	var copyModel = function(fromModel, toModel) {
		for (var prop in fromModel)
			if (fromModel.hasOwnProperty(prop))
				toModel[prop] = fromModel[prop];
	};

	var currentPlayback = new playbackModel(),
		playbackBeforeLastPush = new playbackModel();

	// server comms
	var pushModelUpdates = function() {
		var modelOfUpdatedPropsOnly = new playbackModel();
		var hasAnyChanges = false;

		for (var prop in currentPlayback) {
			if (currentPlayback.hasOwnProperty(prop)) {
				if (currentPlayback[prop] !== playbackBeforeLastPush[prop]) {
					modelOfUpdatedPropsOnly[prop] = currentPlayback[prop];
					hasAnyChanges = true;
				}
				else {
					modelOfUpdatedPropsOnly[prop] = null;
				}
			}
		}

		if (!hasAnyChanges)
			return;

		if (initialSettingsLoaded && comms !== null) {
			comms.pushParamsPatch(modelOfUpdatedPropsOnly);
		}

		copyModel(currentPlayback, playbackBeforeLastPush);
	};

	var commsManager = function() {
		var This = this, 
			loadingUi = getByClass("loading-ui"), 
			controlUi = getByClass("control-ui"), 
			activeLongPollXhr = null,
			longPollingActive = false,
			nextLongPollDelayTimer,
			timeOfLastLongPoll = (new Date()).getTime(),

			createJson = function(obj) {
				var jsonStr = null;

				try {
					jsonStr = JSON.stringify(obj);
				}
				catch (exception) { }

				return jsonStr;
			},

			parseJson = function(jsonStr) {
				var obj = null;

				try {
					obj = JSON.parse(jsonStr);
				}
				catch (exception) { }

				return obj;
			},

			execXhr = function(method, url, payload, timeout, completedCallback, timeoutCallback) {
				var xhr = new XMLHttpRequest();

				xhr.abortTimer = setTimeout(function() {
					if (xhr.readyState !== 4) {
						xhr.abort();
						timeoutCallback();
					}
				}, 3e4);

				xhr.onreadystatechange = function() {
					if (xhr.readyState === 4) {
						completedCallback(xhr.responseText);
					}
				};

				xhr.open(method, url);
				xhr.send(payload);

				return xhr;
			},

			createPlaybackModelFromServerState = function(serverState) {
				var model = new playbackModel();

				model.redMin = Math.min(serverState.r, serverState.R);
				model.redMax = Math.max(serverState.r, serverState.R);
				model.redInvert = serverState.R < serverState.r;
				model.greenMin = Math.min(serverState.g, serverState.G);
				model.greenMax = Math.max(serverState.g, serverState.G);
				model.greenInvert = serverState.G < serverState.g;
				model.blueMin = Math.min(serverState.b, serverState.B);
				model.blueMax = Math.max(serverState.b, serverState.B);
				model.blueInvert = serverState.B < serverState.b;
				model.brightness = serverState.a;
				model.frameSkip = serverState.s;
				model.frameStretch = serverState.S;
				model.videoDirectory = serverState.d;
				model.videoSecondsElapsed = serverState.p;
				model.videoIndex = serverState.v;

				return model;
			},

			findPatchProperty = function(patchModel, playbackModel, prop) {
				if (patchModel[prop] === null)
					return playbackModel[prop];

				return patchModel[prop];
			},

			createColorspacePatchForModel = function(model, serverState, colorProp, invertProp, stdOutput, invertOutput) {
				serverState[currentPlayback[invertProp] ? invertOutput: stdOutput] = model[colorProp];
			},

			createServerStatePatchFromPlaybackModelDiff = function(model) {
				var serverState = {};

				if (model.redMin !== null)
					createColorspacePatchForModel(model, serverState, "redMin", "redInvert", "a", "A");

				if (model.redMax !== null)
					createColorspacePatchForModel(model, serverState, "redMax", "redInvert", "A", "a");

				if (model.redInvert !== null && model.redMin === null)
					createColorspacePatchForModel(currentPlayback, serverState, "redMin", "redInvert", "a", "A");

				if (model.redInvert !== null && model.redMax === null)
					createColorspacePatchForModel(currentPlayback, serverState, "redMax", "redInvert", "A", "a");

				if (model.greenMin !== null)
					createColorspacePatchForModel(model, serverState, "greenMin", "greenInvert", "g", "G");

				if (model.greenMax !== null)
					createColorspacePatchForModel(model, serverState, "greenMax", "greenInvert", "G", "g");

				if (model.greenInvert !== null && model.greenMin === null)
					createColorspacePatchForModel(currentPlayback, serverState, "greenMin", "greenInvert", "g", "G");

				if (model.greenInvert !== null && model.greenMax === null)
					createColorspacePatchForModel(currentPlayback, serverState, "greenMax", "greenInvert", "G", "g");

				if (model.blueMin !== null)
					createColorspacePatchForModel(model, serverState, "blueMin", "blueInvert", "b", "B");

				if (model.blueMax !== null)
					createColorspacePatchForModel(model, serverState, "blueMax", "blueInvert", "B", "b");

				if (model.blueInvert !== null && model.blueMin === null)
					createColorspacePatchForModel(currentPlayback, serverState, "blueMin", "blueInvert", "b", "B");

				if (model.blueInvert !== null && model.blueMax === null)
					createColorspacePatchForModel(currentPlayback, serverState, "blueMax", "blueInvert", "B", "b");

				if (model.brightness !== null)
					serverState.a = model.brightness;

				if (model.frameSkip !== null)
					serverState.s = model.frameSkip;

				if (model.frameStretch !== null)
					serverState.S = model.frameStretch;

				if (model.videoDirectory !== null) {
					serverState.d = model.videoDirectory;
					serverState.v = findPatchProperty(model, currentPlayback, "videoIndex");
					serverState.p = findPatchProperty(model, currentPlayback, "videoSecondsElapsed");
				}

				if (model.videoSecondsElapsed !== null)
					serverState.p = model.videoSecondsElapsed;

				if (model.videoIndex !== null) {
					serverState.v = model.videoIndex;
					serverState.p = findPatchProperty(model, currentPlayback, "videoSecondsElapsed");
				}

				return serverState;
			},

			updateUiWithLoadedParams = function(responseText) {
				var responseJson = parseJson(responseText);

				if (responseJson) {
					var model = createPlaybackModelFromServerState(responseJson);

					if (model) {
						initialSettingsLoaded = true;

						currentPlayback = model;
						copyModel(currentPlayback, playbackBeforeLastPush);

						if (uiView !== null)
							uiView.setUiFromModel(model);
					}
				}
			},

			loadFullParams = function(loadedCallback) {
				var doLoadAttempt = function() {
					execXhr("GET", "/params", null, 3e4, completedCallback, doLoadAttempt);
				}, 
				completedCallback = function(responseText) {
					updateUiWithLoadedParams(responseText);
					loadedCallback();
				};

				doLoadAttempt();
			},

			putParamsPatch = function(serverPatch) {
				var patchParams = createJson(serverPatch),
					completedCallback = function(responseText) {
						updateUiWithLoadedParams(responseText);
						longPollParamsUpdates();
					},
					doPutAttempt = function() {
						execXhr("PUT", "/params", patchParams, 3e4, completedCallback, doPutAttempt);
					};

				doPutAttempt();
			},

			longPollParamsUpdates = function() {
				longPollingActive = true;
				clearTimeout(nextLongPollDelayTimer);

				if (activeLongPollXhr !== null) {
					if ((new Date()).getTime() - timeOfLastLongPoll > 11e3) {
						activeLongPollXhr.abort();
						activeLongPollXhr = null;
					}
					else
						return;
				}

				var completedCallback = function(responseText) {
					activeLongPollXhr = null;
					updateUiWithLoadedParams(responseText);

					if (longPollingActive) {
						clearTimeout(nextLongPollDelayTimer);
						nextLongPollDelayTimer = setTimeout(longPollParamsUpdates, ((new Date()).getTime() - timeOfLastLongPoll - 1e4) * -1);
					}
				}, 
				timeoutCallback = function() {
					clearTimeout(nextLongPollDelayTimer);

					nextLongPollDelayTimer = setTimeout(function() {
						if (longPollingActive)
							longPollParamsUpdates();
					}, 5e3);
				};

				timeOfLastLongPoll = (new Date()).getTime();
				activeLongPollXhr = execXhr("GET", "/next_params", null, 11e3, completedCallback, timeoutCallback);
			},

			cancelActiveLongPoll = function() {
				clearTimeout(nextLongPollDelayTimer);
				longPollingActive = false;

				if (activeLongPollXhr !== null)
					activeLongPollXhr.abort();
			};

		This.pushParamsPatch = function(patchModel) {
			cancelActiveLongPoll();

			var serverPatch = createServerStatePatchFromPlaybackModelDiff(patchModel);
			putParamsPatch(serverPatch);
		};

		This.hardRefreshParams = function() {
			loadingUi.style.display = "block";
			controlUi.style.display = "none";

			cancelActiveLongPoll();
			
			loadFullParams(function() {
				loadingUi.style.display = "none";
				controlUi.style.display = "block";
				longPollParamsUpdates();
			});
		};
	};

	// UI controllers
	var buttonManager = function(buttonElem, clickHandler) {
		var This = this,
			isActive = false,
			inUseLabelClassName = null;

		This.blur = function() {
			buttonElem.blur();
		};

		This.toggleActive = function(newActiveSetting) {
			isActive = newActiveSetting === undefined ? !isActive : newActiveSetting;
			buttonElem.classList[isActive ? "add" : "remove"]("active");
			return isActive;
		};

		This.setLabel = function(labelClassName) {
			var classList = buttonElem.parentNode.classList;

			if (inUseLabelClassName !== null)
				classList.remove(inUseLabelClassName);

			if (labelClassName !== null) {
				classList.add("speed", labelClassName);
			}

			inUseLabelClassName = labelClassName;
		};

		buttonElem.onclick = function() { clickHandler(This); };
	};

	var sliderManager = function(sliderElem, minValue, maxValue, positionChangeHandler, positionValueFormatter) {
		var This = this,
			position1 = 0, 
			position2 = 0,
			bar = getByClass("bar", sliderElem), 
			gripper1 = getByClass("gripper-1", sliderElem), 
			gripper2 = getByClass("gripper-2", sliderElem), 
			gripper1Label = getByClass("gripper-label", sliderElem), 
			maxValueLabel = getByClass("max-value-label", sliderElem),
			isDraggingGripper = null,
			dragIncrementalUpdateInterval,
			lastDragStartX,
			positionAtTimeOfLastDragStart,
			rescheduledGripper1Move,
			rescheduledGripper2Move,

			getGripperTrackWidth = function() {
				return bar.offsetWidth - gripper1.childNodes[0].offsetWidth;
			},
			
			moveGripper = function(gripper, gripperLabel, position) {
				var gripperTrackWidth = getGripperTrackWidth();
				
				if (gripperTrackWidth <= 0) {
					var rescheduleAction = function() {
						moveGripper(gripper, gripperLabel, position);
					};

					if (gripper === gripper1) {
						clearTimeout(rescheduledGripper1Move);
						rescheduledGripper1Move = setTimeout(rescheduleAction, 200);
					}
					else {
						clearTimeout(rescheduledGripper2Move);
						rescheduledGripper2Move = setTimeout(rescheduleAction, 200);
					}

					return;
				}

				var newGripperLeftPosition = getGripperTrackWidth() * (position / maxValue) - 10;

				gripper.style.left = newGripperLeftPosition + "px";

				if (gripperLabel)
					gripperLabel.style.left = (newGripperLeftPosition + 4) + "px";
			},

			normalizePointerEvent = function(event) {
				if (event === null || event === undefined)
					return null;

				if (event.touches)
					return event.touches.length === 1 ? event.touches[0] : null;
				else
					return event.clientX !== undefined ? event : null;
			},

			handleGripperMoveStart = function(gripper, event) {
				var normalizedEventParams = normalizePointerEvent(event);

				if (normalizedEventParams === null)
					return;

				event.preventDefault();

				isDraggingGripper = gripper;
				lastDragStartX = normalizedEventParams.clientX;
				positionAtTimeOfLastDragStart = gripper === gripper1 ? position1 : position2;

				dragIncrementalUpdateInterval = setInterval(function() {
						if (isDraggingGripper === null) {
							clearInterval(dragIncrementalUpdateInterval);
							return;
						}

						positionChangeHandler(
							This, 
							isDraggingGripper === gripper1 ? 1 : 2, 
							isDraggingGripper === gripper1 ? position1 : position2);
					}, 2e3);
			},

			handleGripperMoveDrag = function(event) {
				var normalizedEventParams = normalizePointerEvent(event);
				
				if (isDraggingGripper === null || normalizedEventParams === null)
					return;

				event.preventDefault();

				This.setPosition(
					isDraggingGripper === gripper1 ? 1 : 2,
					Math.round(
						(((normalizedEventParams.clientX - lastDragStartX) / getGripperTrackWidth()) * maxValue) + 
						positionAtTimeOfLastDragStart));
			},

			handleGripperMoveEnd = function() {
				if (isDraggingGripper === null)
					return;

				positionChangeHandler(
					This, 
					isDraggingGripper === gripper1 ? 1 : 2, 
					isDraggingGripper === gripper1 ? position1 : position2);

				isDraggingGripper = null;
			},

			getDraggableListenerConfig = function(shouldCapture, isPassive) {
				return {
					capture: shouldCapture, 
					passive: isPassive
				};
			},

			setupDraggable = function(gripper) {
				gripper.addEventListener(
					"mousedown", 
					function(event) { handleGripperMoveStart(gripper, event); }, 
					getDraggableListenerConfig(true, false));
				document.addEventListener("mouseup", handleGripperMoveEnd, getDraggableListenerConfig(false, true));
				document.addEventListener("mouseleave", handleGripperMoveEnd, getDraggableListenerConfig(false, true));
				document.addEventListener("mousemove", handleGripperMoveDrag, getDraggableListenerConfig(false, false));

				gripper.addEventListener(
					"touchstart", 
					function(event) { handleGripperMoveStart(gripper, event); }, 
					getDraggableListenerConfig(true, false));
				document.addEventListener("touchend", handleGripperMoveEnd, getDraggableListenerConfig(false, true));
				document.addEventListener("touchcancel", handleGripperMoveEnd, getDraggableListenerConfig(false, true));
				document.addEventListener("touchleave", handleGripperMoveEnd, getDraggableListenerConfig(false, true));
				document.addEventListener("touchmove", handleGripperMoveDrag, getDraggableListenerConfig(false, false));
			},

			fixPositionBounds = function(position) {
				return Math.min(maxValue, Math.max(position, 0));
			};

		This.setMinValue = function(newMinValue) {
			minValue = newMinValue;
			This.setPosition(1, 0);

			if (gripper2)
				This.setPosition(2, 0);
		};

		This.setMaxValue = function(newMaxValue) {
			maxValue = newMaxValue;
			This.setPosition(1, 0);

			if (gripper2)
				This.setPosition(2, 0);
			
			if (maxValueLabel)
				maxValueLabel.innerHTML = positionValueFormatter(maxValue);
		};

		This.setPosition = function(gripperIndex, newPosition) {
			if (gripperIndex === 1) {
				position1 = fixPositionBounds(gripper2 ? Math.min(newPosition, position2 - 1) : newPosition);

				if (gripper1Label)
					gripper1Label.innerHTML = positionValueFormatter(position1);

				moveGripper(gripper1, gripper1Label, position1);
			}
			else {
				position2 = fixPositionBounds(Math.max(newPosition, position1 + 1));
				moveGripper(gripper2, null, position2);
			}
		};

		This.setPositions = function(newPositionGripper1, newPositionGripper2) {
			This.setPosition(1, 0); // get out of the way so that max won't through a bounds check error
			This.setPosition(2, newPositionGripper2);
			This.setPosition(1, newPositionGripper1);
		};

		This.setMinValue(minValue);
		This.setMaxValue(maxValue);

		setupDraggable(gripper1);

		if (gripper2)
			setupDraggable(gripper2);
	};

	// UI setup
	var uiView = function() {
		var This = this,
			skipBackButtonManager,
			trackSelect,
			skipForwardButtonManager,
			rewindSpeed,
			rewindButtonManager,
			pauseActive = false,
			pauseButtonManager,
			fastForwardSpeed,
			fastForwardButtonManager,
			playbackSliderManager,
			brightnessSliderManager,
			slowMotionSliderManager,
			redInvertCheckbox,
			redSliderManager,
			greenInvertCheckbox,
			greenSliderManager,
			blueInvertCheckbox,
			blueSliderManager,
			rainbowMode = false,
			rainbowModeButtonManager,
			wrapMoveTrackSelect = function(delta) {
				var index = trackSelect.selectedIndex;
				if (!index) index = 0;

				index += delta;
				if (index < 0) index = trackSelect.options.length - 1;
				if (index >= trackSelect.options.length) index = 0;

				trackSelect.selectedIndex = index;
			},
			setTrackList = function(tracks) {
				for (; trackSelect.options.length > 0;)
					trackSelect.options[0] = null;

				for (var track = 0; track < tracks.length; track++)
					trackSelect.options[trackSelect.options.length] = new Option(tracks[track].name, tracks[track].length);

				trackSelect.selectedIndex = 0;
			},
			setRewindButtonState = function() {
				rewindButtonManager.setLabel(rewindSpeed === null ? null : "speed-" + rewindSpeed + "x");
				rewindButtonManager.toggleActive(rewindSpeed !== null);
			},
			setPauseButtonState = function() {
				pauseButtonManager.toggleActive(pauseActive);
			},
			setFastForwardButtonState = function() {
				fastForwardButtonManager.setLabel(fastForwardSpeed === null ? null : "speed-" + fastForwardSpeed + "x");
				fastForwardButtonManager.toggleActive(fastForwardSpeed !== null);
			},
			setRainbowModeButtonState = function() {
				rainbowModeButtonManager.toggleActive(rainbowMode);
			};

		This.setupUi = function() {
			var skipBackButton = getByClass("button skip-back");	
			skipBackButtonManager = new buttonManager(
				skipBackButton, 
				function() {
					wrapMoveTrackSelect(-1);
					skipBackButton.blur();
					trackSelect.onchange();
				});

			trackSelect = getByClass("select track");
			trackSelect.onchange = function() {
				playbackSliderManager.setMaxValue(trackSelect.options[trackSelect.selectedIndex].value);
				playbackSliderManager.setPosition(1, 0);

				currentPlayback.videoDirectory = rainbowMode ? 1 : 0;
				currentPlayback.videoIndex = trackSelect.selectedIndex;
				currentPlayback.videoSecondsElapsed = 0;
				pushModelUpdates();
			};

			var skipForwardButton = getByClass("button skip-forward");
			skipForwardButtonManager = new buttonManager(
					skipForwardButton, 
					function() {
						wrapMoveTrackSelect(1);
						skipForwardButton.blur();
						trackSelect.onchange();
					});


			var rewindButton = getByClass("button rewind");
			rewindButtonManager = new buttonManager(
				rewindButton, 
				function(buttonManager) {
					fastForwardSpeed = null;
					setFastForwardButtonState();

					pauseActive = false;
					setPauseButtonState();

					if (rewindSpeed === null)
						rewindSpeed = 2;
					else if (rewindSpeed === 5)
						rewindSpeed = null;
					else
						rewindSpeed++;

					setRewindButtonState();
					buttonManager.blur();

					currentPlayback.frameSkip = rewindSpeed === null ? 0 : rewindSpeed * -1;
					pushModelUpdates();
				});

			var pauseButton = getByClass("button pause");
			pauseButtonManager = new buttonManager(
				pauseButton,
				function(buttonManager) {
					pauseActive = !pauseActive;
					setPauseButtonState();

					rewindSpeed = fastForwardSpeed = null;
					setRewindButtonState();
					setFastForwardButtonState();

					pauseButton.blur();

					currentPlayback.frameSkip = pauseActive ? -1 : 0;
					pushModelUpdates();
				});

			var fastForwardButton = getByClass("button fast-forward");
			fastForwardButtonManager = new buttonManager(
				fastForwardButton, 
				function(buttonManager) {
					rewindSpeed = null;
					setRewindButtonState();

					pauseActive = false;
					setPauseButtonState();

					if (fastForwardSpeed === null)
						fastForwardSpeed = 2;
					else if (fastForwardSpeed === 5)
						fastForwardSpeed = null;
					else
						fastForwardSpeed++;

					setFastForwardButtonState();
					buttonManager.blur();

					currentPlayback.frameSkip = fastForwardSpeed === null ? 0 : fastForwardSpeed - 1;
					pushModelUpdates();
				});

			// playback indicator
			playbackSliderManager = new sliderManager(
				getByClass("slider video-playback"), 
				0, 
				0, 
				function(sliderManager, gripperIndex, position) {
					currentPlayback.videoSecondsElapsed = position;
					pushModelUpdates();
				}, 
				function(position) {
					return Math.floor(position / 60) + ":" + (position % 60).toString().padStart(2, '0');
				});

			// brightness
			brightnessSliderManager = new sliderManager(
				getByClass("slider brightness"), 
				0, 
				255, 
				function(sliderManager, gripperIndex, position) {
					currentPlayback.brightness = position;
					pushModelUpdates();
				});

			// slow motion
			slowMotionSliderManager = new sliderManager(
				getByClass("slider slow-motion"), 
				0, 
				250, 
				function(sliderManager, gripperIndex, position) {
					currentPlayback.frameStretch = position;
					pushModelUpdates();
				});

			// RGB settings
			redInvertCheckbox = getByClass("invert-red");
			redSliderManager = new sliderManager(
				getByClass("slider red-min-max"), 
				0, 
				255, 
				function(sliderManager, gripperIndex, position) {
					currentPlayback[gripperIndex === 1 ? "redMin" : "redMax"] = position;
					pushModelUpdates();
				});

			redInvertCheckbox.onchange = function() {
				redInvertCheckbox.blur();
				currentPlayback.redInvert = redInvertCheckbox.checked;
				pushModelUpdates();
			};

			greenInvertCheckbox = getByClass("invert-green");
			greenSliderManager = new sliderManager(
				getByClass("slider green-min-max"), 
				0, 
				255, 
				function(sliderManager, gripperIndex, position) {
					currentPlayback[gripperIndex === 1 ? "greenMin" : "greenMax"] = position;
					pushModelUpdates();
				});

			greenInvertCheckbox.onchange = function() {
				greenInvertCheckbox.blur();
				currentPlayback.greenInvert = greenInvertCheckbox.checked;
				pushModelUpdates();
			};

			blueInvertCheckbox = getByClass("invert-blue");
			blueSliderManager = new sliderManager(
				getByClass("slider blue-min-max"), 
				0, 
				255, 
				function(sliderManager, gripperIndex, position) {
					currentPlayback[gripperIndex === 1 ? "blueMin" : "blueMax"] = position;
					pushModelUpdates();
				});

			blueInvertCheckbox.onchange = function() {
				blueInvertCheckbox.blur();
				currentPlayback.blueInvert = blueInvertCheckbox.checked;
				pushModelUpdates();
			};

			// twinkle buttons
			var setTwinkleValues = function(redMin, redMax, greenMin, greenMax, blueMin, blueMax) {
				currentPlayback.redMin = redMin === null ? 0 : redMin;
				currentPlayback.redMax = redMax === null ? 64 : redMax;
				currentPlayback.greenMin = greenMin === null ? 0 : greenMin;
				currentPlayback.greenMax = greenMax === null ? 64 : greenMax;
				currentPlayback.blueMin = blueMin === null ? 0 : blueMin;
				currentPlayback.blueMax = blueMax === null ? 64 : blueMax;

				redSliderManager.setPositions(currentPlayback.redMin, currentPlayback.redMax);
				greenSliderManager.setPositions(currentPlayback.greenMin, currentPlayback.greenMax);
				blueSliderManager.setPositions(currentPlayback.blueMin, currentPlayback.blueMax);

				redInvertCheckbox.checked = greenInvertCheckbox.checked = blueInvertCheckbox.checked = 
					currentPlayback.redInvert = currentPlayback.greenInvert = currentPlayback.blueInvert = false;

				pushModelUpdates();
			};

			var twinkleRedButton = getByClass("twinkle-red"), 
				twinkleGreenButton = getByClass("twinkle-green"), 
				twinkleBlueButton = getByClass("twinkle-blue");

			twinkleRedButton.onclick = function() {
				twinkleRedButton.blur();
				setTwinkleValues(65, 255, null, null, null, null);
			};

			twinkleGreenButton.onclick = function() {
				twinkleGreenButton.blur();
				setTwinkleValues(null, null, 65, 255, null, null);
			};

			twinkleBlueButton.onclick = function() {
				twinkleBlueButton.blur();
				setTwinkleValues(null, null, null, null, 65, 255);
			};

			// invert button
			var invertAllButton = getByClass("invert-all");
			invertAllButton.onclick = function() {
				invertAllButton.blur();
				var newInvertValue = !redInvertCheckbox.checked;
				redInvertCheckbox.checked = greenInvertCheckbox.checked = blueInvertCheckbox.checked = 
					currentPlayback.redInvert = currentPlayback.greenInvert = currentPlayback.blueInvert = newInvertValue;
				pushModelUpdates();
			};

			var rainbowModeSwitchBackVideoIndex = 0,
				rainbowModeButton = getByClass("button rainbows");
			rainbowModeButtonManager = new buttonManager(
				rainbowModeButton, 
				function(buttonManager) {
					var currentVideoIndex = trackSelect.selectedIndex;
					rainbowMode = !rainbowMode;
					setRainbowModeButtonState();
					setTrackList(rainbowMode ? rainbowTracks : standardTracks);
					trackSelect.selectedIndex = rainbowModeSwitchBackVideoIndex;
					rainbowModeSwitchBackVideoIndex = currentVideoIndex;
					trackSelect.onchange();
					rainbowModeButton.blur();
				});

			// reset button
			var resetButton = getByClass("reset-all");
			resetButton.onclick = function() {
				resetButton.blur();

				currentPlayback.brightness = 255;
				currentPlayback.frameStretch = 0;

				currentPlayback.redMin = 0;
				currentPlayback.redMax = 255;
				currentPlayback.redInvert = false;

				currentPlayback.greenMin = 0;
				currentPlayback.greenMax = 255;
				currentPlayback.greenInvert = false;

				currentPlayback.blueMin = 0;
				currentPlayback.blueMax = 255;
				currentPlayback.blueInvert = false;

				This.setUiFromModel(currentPlayback);
				pushModelUpdates();
			};

			This.setUiFromModel(currentPlayback);
		};

		This.setUiFromModel = function(model) {
			setTrackList(model.videoDirectory === 1 ? rainbowTracks : standardTracks);
			trackSelect.selectedIndex = model.videoIndex < trackSelect.options.length 
				? model.videoIndex
				: 0;

			rewindSpeed = model.frameSkip < -1 ? model.frameSkip * -1 : null;
			pauseActive = model.frameSkip === -1;
			fastForwardSpeed = model.frameSkip > 0 ? model.frameSkip + 1 : null;

			setRewindButtonState();
			setPauseButtonState();
			setFastForwardButtonState();

			playbackSliderManager.setMaxValue(trackSelect.options[trackSelect.selectedIndex].value);
			playbackSliderManager.setPosition(1, model.videoSecondsElapsed);

			brightnessSliderManager.setPosition(1, model.brightness);
			slowMotionSliderManager.setPosition(1, model.frameStretch);

			redSliderManager.setPositions(model.redMin, model.redMax);
			redInvertCheckbox.checked = model.redInvert;

			greenSliderManager.setPositions(model.greenMin, model.greenMax);
			greenInvertCheckbox.checked = model.greenInvert;

			blueSliderManager.setPositions(model.blueMin, model.blueMax);
			blueInvertCheckbox.checked = model.blueInvert;

			rainbowMode = model.videoDirectory === 1;
			setRainbowModeButtonState();
		};
	};

	var uiView = new uiView(), 
		comms = null;

	document.addEventListener("DOMContentLoaded", function() {
			uiView.setupUi();

			comms = new commsManager();
			comms.hardRefreshParams();
		}, false);

	document.addEventListener("visibilitychange", function() {
		if (document.visibilityState === "visible" && comms !== null)
			comms.hardRefreshParams();
	}, false);
})();