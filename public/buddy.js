window.Buddy = function(root) {

	root = root || "http://api.buddyplatform.com"

	var buddy = {};

	
	var _appId;
	var _appKey;
	var _options;
	var _settings;


	function supports_html5_storage() {
	  try {
	    return 'localStorage' in window && window['localStorage'] !== null;
	  } catch (e) {
	    return false;
	  }
	}

	function getSettings(force) {
		if ((!_settings || force) && supports_html5_storage() && _appId) {

			var json = window.localStorage.getItem(_appId);
			_settings = JSON.parse(json);
		}
		return _settings || {};
	}

	function updateSettings(updates, replace) {
		if (supports_html5_storage() && _appId) {


			var settings = updates;

			if (!replace) {
				settings = getSettings();
				for (var key in updates) {
					settings[key] = updates[key];
				}
			}

			window.localStorage.setItem(_appId, JSON.stringify(settings));
			_settings = settings;
			return _settings;
		}

	}

	function clearSettings(type) {
		if (supports_html5_storage() && _appId) {

			if (!type) {
				window.localStorage.removeItem(_appId);
				_settings = {}
			}
			else {

				var s = getSettings();
				for (var key in s) {

					var remove = type.device && key.indexOf("device") === 0 ||
								 type.user && key.indexOf("user") === 0;
					if (remove) {
						delete s[key];
					}
				}
				return updateSettings(s, true);
			}
		}
	}


	function getUniqueId() {

		var s = getSettings();

		if (!s.unique_id) {
			
			s = updateSettings({
				unique_id: _appId + ":" +new Date().getTime() // good enough for this
			})
		}
		
		return s.unique_id;
	}
	

	function getAccessToken() {

		var s = getSettings();
		
		var token = s.user_token || s.device_token;

		if (token && (!token.expires || token.expires > new Date().getTime())) {
			return token.value;
		}
		return null;
	}

	
	function setAccessToken(type, value) {


		if (value) {
			
			value = {
				value: value.accessToken,
				expires: value.accessTokenExpires.getTime()
			}
		}

		var update = {};

		update[type + "_token"] = value;

		updateSettings(update);
	}

	
	function loadCreds() {
		var s = getSettings();

		if (s && s.app_id) {
			_appId = s.app_id;
			_appKey = s.app_key;
			getAccessToken();
		}
	}

	loadCreds();

	buddy.init = function(appId, appKey, options) {

		_options = options || {};

		_appId = appId;

		if (!_appId) throw new Error("appId and appKey required");

		_appKey = appKey;

		if (_options.root) {
			root = options.root;
		}

		getSettings(true);
		
		buddy.registerDevice(appId, appKey);

	}

	buddy.clear = function() {

		clearSettings();
	}

	buddy.registerDevice = function(appId, appKey, callback) {

		if (getAccessToken()) {
			callback && callback();
			return;
		}

		buddy.makeRequest("POST", "/devices", {
			appID: appId || _appId,
			appKey: appKey || _appKey,
			platform: "Javascript",
			model: navigator.userAgent,
			uniqueId: getUniqueId()
		}, function(err, r){
			if (r.success) {
				_appId = appId || _appId;
				_appKey = appKey || _appKey;
				updateSettings({app_id: _appId, app_key:appKey, service_root: r.serviceRoot});
				setAccessToken("device", r.result);
			}
			callback && callback(err, r);
		}, true)
	}

	buddy.getUser = function(callback) {

		var s = getSettings();

		if (!s.user_id) {
			return callback && callback();
		}

		if (callback) {

			buddy.makeRequest("GET", "/users/me", function(err, r){

				callback && callback(err, r.result);
			});
		}

		return s.user_id;


	}

	buddy.loginUser = function(username, password, callback) {

		if (!getAccessToken()) {
			throw new Error("Device must be registered first")
		}

		buddy.makeRequest("POST", "/users/login", {
			username: username,
			password: password
		}, function(err, r){


			if (r.success) {
				var user = r.result;
				updateSettings({
					user_id: user.id
				});

				setAccessToken('user', user);
			
			}
			callback && callback(err, r && r.result);
		});
	}

	buddy.logoutUser = function(callback) {

		var s = getSettings();
		var userId = s.user_id;

		if (!userId) {
			return callback && callback();
		}

		

		buddy.makeRequest("POST", '/users/me/logout', function(){

				clearSettings({
					user: true
				})

				callback && callback();

		});
	}

	buddy.createUser = function(options, callback) {

		if (!getAccessToken()) {
			throw new Error("Device must be registered first")
		}

		if (!options.username || !options.password) {
			throw new Error("Username and password are required.");
		}

		buddy.makeRequest("POST", "/users", options, function(err, r){

			if (r.success) {
				var user = r.result;
				updateSettings({
						user_id: user.id
					});
				setAccessToken('user', user);
			}
			callback && callback(err, r && r.result);
		});
	}

	function defer(callback) {

		if (!callback) return;

		setTimeout(function() {
			var args = Array.prototype.slice.call(arguments, 2);
			callback.apply(null, args);
		}, 0);
	}

	var AuthErrors = {
		AuthFailed :                        0x100,
		AuthAccessTokenInvalid :            0x104,
		AuthUserAccessTokenRequired :       0x107,
		AuthAppCredentialsInvalid :         0x105
	}


	var _requestCount = 0;

	function startRequest() {
		_requestCount++;
	}
	function processResult(result, callback) {

		_requestCount--;
		
		result.success = !result.error && typeof result.result != 'undefined';

		if (result.error) {
			var err = new Error(result.message || result.error);
			err.error = result.error;
			err.errorNumber = result.errorNumber;
			err.status = result.status;

			callback && callback(err, result);
			if (!callback) {
				console.warn(result.error);
			}
		}
		else {
			convertDates(result.result);
			callback && callback(null, result);
			if (!callback) {

				console.log(JSON.stringify(result,  null, 2));
			}
		}


	}


function convertDates(obj, seen) {

		seen = seen || {};

		if (!obj || seen[obj]) {
			return;
		}

		seen[obj] = true;

		for (var key in obj) {
			var val = obj[key];
			if (typeof val ==  'string') {
				var match = val.match(/\/Date\((\d+)\)\//);
				if (match) {
					obj[key] = new Date(Number(match[1]));
				}
			}
			else if (typeof value == 'object') {
				convertDates(obj);
			}
		}
		return obj;

	}

	
	


	
	buddy.makeRequest = function(method, url, parameters, callback, noAutoToken) {

		var at = getAccessToken();
		
		if (at && !_appKey) {
			return callback(new Error("Init must be called first."))
		}
		else if (!at && !noAutoToken) {

			buddy.registerDevice(null, null, false, function(err, r1){
				if (!err && r1.success) {
					at = getAccessToken();

					if (at) {
						buddy.makeRequest(method, url, parameters, callback);
						return;
					}

				}

			})
			return;
		}

		if (typeof parameters == 'function') {
			callback = parameters;
			parameters = null;
		}


		var headers = {
				"Accept" : "application/json"
			};

		if (method == "GET" && parameters != null) {
			url += "?"
			for (var k in parameters) {
				var v = parameters[k];
				if (v) {
					url += k + "=" + encodeURIComponent(v.toString()) + "&"
				}
			}
			parameters = null;
		}
		else if (parameters != null) {
			headers["Content-Type"] = "application/json";
		}

		if (at) {
			headers["Authorization"] = "Buddy " + at;
		}

		// look for file parameters
		//
		if (parameters) {


			var fileParams = null;
			var nonFileParams = null;

			for (var name in parameters) {
				var val = parameters[name];

				if (val instanceof File) {
					fileParams = {} || fileParams;
					fileParams[name] = val;
				}
				else {
					nonFileParams = nonFileParams || {}
					nonFileParams[name] = val;
				}
			}

			if (fileParams) {
				delete headers["Content-Type"];


				var formData = new FormData();

                for (var p in fileParams) {
                        formData.append(p, fileParams[p]);
                }
                if (nonFileParams) {
	                formData.append("body", new Blob([JSON.stringify(nonFileParams)], {type:'applicaiton/json'}));
	            }
                parameters = formData;

			}
			else {
				parameters = nonFileParams ? JSON.stringify(nonFileParams) : null;
			}
		}
		
		var s = getSettings();
		var r = s.service_root || root;
	    $.ajax({
			method: method,
			url: root + url,
			headers: headers,
			contentType: false,
			processData: false,
			data: parameters,
			success:function(data) {
				processResult(data, callback);
			},
			error: function(data, status, response) {
				if (data.status === 0) {
					data = {
						status: 0,
						error: "NoInternetConnection",
						errorNumber: -1
					};
				}
				else {
					data = JSON.parse(data.responseText);
					
					switch (data.errorNumber) {
						case AuthErrors.AuthAccessTokenInvalid:
						case AuthErrors.AuthAppCredentialsInvalid:
							clearSettings();
							break;
						case AuthErrors.AuthUserAccessTokenRequired:
							clearSettings({user:true});
							options && options.loginRequired && defer(options.loginRequired);
							break;
					}
				}

				processResult(data, callback);
				
			}
		});


	}




	return buddy;
	

}();