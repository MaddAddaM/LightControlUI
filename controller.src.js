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

		if (initialSettingsLoaded) {
			// TODO push the updated props to the server
		}

		// TODO DEBUG
		console.debug(modelOfUpdatedPropsOnly);

		copyModel(currentPlayback, playbackBeforeLastPush);
	};

	// TODO load initial params
	// TODO block off page until this happens
	// TODO also block off the page and reload on page visibility change
	// TODO run long polling and push in updates

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
			lastDragStartX,
			positionAtTimeOfLastDragStart,

			getGripperTrackWidth = function() {
				return bar.offsetWidth - gripper1.childNodes[0].offsetWidth;
			},
			
			moveGripper = function(gripper, gripperLabel, position) {
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

		This.setMinValue(minValue);
		This.setMaxValue(maxValue);

		setupDraggable(gripper1);

		if (gripper2)
			setupDraggable(gripper2);
	};

	// UI setup
	var setupUi = function() {
		var wrapMoveTrackSelect = function(delta) {
			var index = trackSelect.selectedIndex;
			if (!index) index = 0;

			index += delta;
			if (index < 0) index = trackSelect.options.length - 1;
			if (index >= trackSelect.options.length) index = 0;

			trackSelect.selectedIndex = index;
		};

		var skipBackButton = getByClass("button skip-back"),
			skipBackButtonManager = new buttonManager(
			skipBackButton, 
			function() {
				wrapMoveTrackSelect(-1);
				skipBackButton.blur();
				trackSelect.onchange();
			});

		var trackSelect = getByClass("select track"),
			setTrackList = function(tracks) {
				for (; trackSelect.options.length > 0;)
					trackSelect.options[0] = null;

				for (var track = 0; track < tracks.length; track++)
					trackSelect.options[trackSelect.options.length] = new Option(tracks[track].name, tracks[track].length);

				trackSelect.selectedIndex = 0;
			};
		trackSelect.onchange = function() {
			playbackSliderManager.setMaxValue(trackSelect.options[trackSelect.selectedIndex].value);
			playbackSliderManager.setPosition(1, 0);

			currentPlayback.videoDirectory = rainbowMode ? 1 : 0;
			currentPlayback.videoIndex = trackSelect.selectedIndex;
			currentPlayback.videoSecondsElapsed = 0;
			pushModelUpdates();
		};
		setTrackList(standardTracks);

		var skipForwardButton = getByClass("button skip-forward"),
			skipForwardButtonManager = new buttonManager(
				skipForwardButton, 
				function() {
					wrapMoveTrackSelect(1);
					skipForwardButton.blur();
					trackSelect.onchange();
				});


		var rewindSpeed = null,
			rewindButton = getByClass("button rewind"),
			setRewindButtonState = function(buttonManager) {
				buttonManager.setLabel(rewindSpeed === null ? null : "speed-" + rewindSpeed + "x");

				if (rewindSpeed === null || rewindSpeed === 2)
					buttonManager.toggleActive(rewindSpeed !== null);
			},
			rewindButtonManager = new buttonManager(
				rewindButton, 
				function(buttonManager) {
					fastForwardSpeed = null;
					setFastForwardButtonState(fastForwardButtonManager);

					pauseActive = false;
					setPauseButtonState(pauseButtonManager);

					if (rewindSpeed === null)
						rewindSpeed = 2;
					else if (rewindSpeed === 5)
						rewindSpeed = null;
					else
						rewindSpeed++;

					setRewindButtonState(buttonManager);
					buttonManager.blur();

					currentPlayback.frameSkip = rewindSpeed === null ? 0 : rewindSpeed * -1;
					pushModelUpdates();
				});

		var pauseActive = false,
			pauseButton = getByClass("button pause"),
			setPauseButtonState = function(buttonManager) {
				buttonManager.toggleActive(pauseActive);
			},
			pauseButtonManager = new buttonManager(
				pauseButton,
				function(buttonManager) {
					pauseActive = !pauseActive;
					setPauseButtonState(buttonManager);

					rewindSpeed = fastForwardSpeed = null;
					setRewindButtonState(rewindButtonManager);
					setFastForwardButtonState(fastForwardButtonManager);

					pauseButton.blur();

					currentPlayback.frameSkip = pauseActive ? -1 : 0;
					pushModelUpdates();
				});

		var fastForwardSpeed = null,
			fastForwardButton = getByClass("button fast-forward"),
			setFastForwardButtonState = function(buttonManager) {
				buttonManager.setLabel(fastForwardSpeed === null ? null : "speed-" + fastForwardSpeed + "x");

				if (fastForwardSpeed === null || fastForwardSpeed === 2)
					buttonManager.toggleActive(fastForwardSpeed !== null);
			},
			fastForwardButtonManager = new buttonManager(
				fastForwardButton, 
				function(buttonManager) {
					rewindSpeed = null;
					setRewindButtonState(rewindButtonManager);

					pauseActive = false;
					setPauseButtonState(pauseButtonManager);

					if (fastForwardSpeed === null)
						fastForwardSpeed = 2;
					else if (fastForwardSpeed === 5)
						fastForwardSpeed = null;
					else
						fastForwardSpeed++;

					setFastForwardButtonState(buttonManager);
					buttonManager.blur();

					currentPlayback.frameSkip = fastForwardSpeed === null ? 0 : fastForwardSpeed - 1;
					pushModelUpdates();
				});

		// playback indicator
		var playbackSliderManager = new sliderManager(
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
		playbackSliderManager.setMaxValue(trackSelect.options[trackSelect.selectedIndex].value);
		playbackSliderManager.setPosition(1, 0);

		// brightness
		var brightnessSliderManager = new sliderManager(
			getByClass("slider brightness"), 
			0, 
			255, 
			function(sliderManager, gripperIndex, position) {
				currentPlayback.brightness = position;
				pushModelUpdates();
			});
		brightnessSliderManager.setPosition(1, 255);

		// slow motion
		var slowMotionSliderManager = new sliderManager(
			getByClass("slider slow-motion"), 
			0, 
			250, 
			function(sliderManager, gripperIndex, position) {
				currentPlayback.frameStretch = position;
				pushModelUpdates();
			});

		// RGB settings
		var redInvertCheckbox = getByClass("invert-red"),
			redSliderManager = new sliderManager(
				getByClass("slider red-min-max"), 
				0, 
				255, 
				function(sliderManager, gripperIndex, position) {
					currentPlayback[gripperIndex === 1 ? "redMin" : "redMax"] = position;
					pushModelUpdates();
				});
		redSliderManager.setPosition(1, 0);
		redSliderManager.setPosition(2, 255);

		redInvertCheckbox.onchange = function() {
			redInvertCheckbox.blur();
			currentPlayback.redInvert = redInvertCheckbox.checked;
			pushModelUpdates();
		};

		var greenInvertCheckbox = getByClass("invert-green"),
			greenSliderManager = new sliderManager(
				getByClass("slider green-min-max"), 
				0, 
				255, 
				function(sliderManager, gripperIndex, position) {
					currentPlayback[gripperIndex === 1 ? "greenMin" : "greenMax"] = position;
					pushModelUpdates();
				});
		greenSliderManager.setPosition(1, 0);
		greenSliderManager.setPosition(2, 255);

		greenInvertCheckbox.onchange = function() {
			greenInvertCheckbox.blur();
			currentPlayback.greenInvert = greenInvertCheckbox.checked;
			pushModelUpdates();
		};

		var blueInvertCheckbox = getByClass("invert-blue"),
			blueSliderManager = new sliderManager(
				getByClass("slider blue-min-max"), 
				0, 
				255, 
				function(sliderManager, gripperIndex, position) {
					currentPlayback[gripperIndex === 1 ? "blueMin" : "blueMax"] = position;
					pushModelUpdates();
				});
		blueSliderManager.setPosition(1, 0);
		blueSliderManager.setPosition(2, 255);

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

			redSliderManager.setPosition(1, currentPlayback.redMin);
			redSliderManager.setPosition(2, currentPlayback.redMax);
			greenSliderManager.setPosition(1, currentPlayback.greenMin);
			greenSliderManager.setPosition(2, currentPlayback.greenMax);
			blueSliderManager.setPosition(1, currentPlayback.blueMin);
			blueSliderManager.setPosition(2, currentPlayback.blueMax);

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

		var rainbowMode = false,
			rainbowModeSwitchBackVideoIndex = 0,
			rainbowModeButton = getByClass("button rainbows"),
			rainbowModeButtonManager = new buttonManager(
				rainbowModeButton, 
				function(buttonManager) {
					var currentVideoIndex = trackSelect.selectedIndex;
					rainbowMode = !rainbowMode;
					buttonManager.toggleActive(rainbowMode);
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
			brightnessSliderManager.setPosition(1, 255);

			currentPlayback.frameStretch = 0;
			slowMotionSliderManager.setPosition(1, 0);

			currentPlayback.redMin = 0;
			currentPlayback.redMax = 255;
			redSliderManager.setPosition(1, 0);
			redSliderManager.setPosition(2, 255);
			currentPlayback.redInvert = redInvertCheckbox.checked = false;

			currentPlayback.greenMin = 0;
			currentPlayback.greenMax = 255;
			greenSliderManager.setPosition(1, 0);
			greenSliderManager.setPosition(2, 255);
			currentPlayback.greenInvert = greenInvertCheckbox.checked = false;

			currentPlayback.blueMin = 0;
			currentPlayback.blueMax = 255;
			blueSliderManager.setPosition(1, 0);
			blueSliderManager.setPosition(2, 255);
			currentPlayback.blueInvert = blueInvertCheckbox.checked = false;

			pushModelUpdates();
		};
	};

	document.addEventListener('DOMContentLoaded', setupUi, false);
})();