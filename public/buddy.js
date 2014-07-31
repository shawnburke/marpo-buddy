

window.Buddy = function(root) {


	var supports_html5_storage = function(){
		try {
			return 'localStorage' in window && window['localStorage'] !== null;
		} catch (e) {
			return false;
		}
	}


	function BuddyClient(appId, appKey, settings){
		if(!appId)
		{
			throw "appId must be given on a BuddyClient";
		}
		this._appId = appId;
		if(!appKey)
		{
			throw "appKey must be given on a BuddyClient";
		}
		this._appKey = appKey;

		// set the settings so we pick up the instanceName
		//
		this._settings = settings;

		this._settings = this.getSettings(true);


		if (settings) {
			for (var k in settings) {
				this._settings[k] = settings[k];
			}
		}

		this.root = this._settings.root || "https://api.buddyplatform.com"
		this._settings.root = this.root;
		this._requestCount = 0;

		this._output = settings.output || console;

		function startRequest() {
			this._requestCount++;
		}
	}
	
	BuddyClient.prototype.getSettings = function(force) {
		if ((!this._settings || force) && supports_html5_storage() && this._appId) {

			var json = window.localStorage.getItem(_calculateClientKey(this._appId, this._settings));
			this._settings = JSON.parse(json);
		}
		return this._settings || {};
	}
	
	BuddyClient.prototype.updateSettings = function(updates, replace) {
		if (supports_html5_storage() && this._appId) {
			var settings = updates;

			if (!replace) {
				settings = getSettings();
				for (var key in updates) {
					settings[key] = updates[key];
				}
			}

			if (!this._settings.nosave) {
			    window.localStorage.setItem(_calculateClientKey(this._appId, this._settings), JSON.stringify(settings));
			}
			this._settings = settings;
			return this._settings;
		}
	}

	BuddyClient.prototype.clearSettings = function(type) {
		if (supports_html5_storage() && this._appId) {

			if (!type) {
				window.localStorage.removeItem(_calculateClientKey(this._appId, this._settings));
				this._settings = {}
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
    
	
	
	BuddyClient.prototype._calculateClientKey = function(appId, options){
		return Buddy._calculateClientKey(appId, options);
	}
	
	BuddyClient.prototype.updateSettings = function(updates, replace){
		if (supports_html5_storage() && this._appId) {
			var settings = updates;
			
			if (!replace) {
				settings = getSettings();
				for (var key in updates) {
					settings[key] = updates[key];
				}
			}
			
			if (!this._settings.nosave) {
			    window.localStorage.setItem(_calculateClientKey(this._appId, this._settings), JSON.stringify(settings));
			}
			this._settings = settings;
			return this._settings;
		}
	}
	
	BuddyClient.prototype.clearSettings = function(type){
		if (supports_html5_storage() && this._appId) {
			if (!type) {
				window.localStorage.removeItem(_calculateClientKey(this._appId, this._settings));
				this._settings = {}
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
	
	BuddyClient.prototype.getUniqueId = function() {
		var s = getSettings();

		if (!s.unique_id) {
			
			s = updateSettings({
				unique_id: this._appId + ":" +new Date().getTime() // good enough for this
			})
		}
		
		return s.unique_id;
	}
	
	BuddyClient.prototype.getAccessToken = function() {
		var s = getSettings();
		
		var token = s.user_token || s.device_token;

		if (token && (!token.expires || token.expires > new Date().getTime())) {
			return token.value;
		}
		return null;
	}
    	
	BuddyClient.prototype.setAccessToken = function(type, value) {
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
    	
	BuddyClient.prototype.loadCreds = function() {
		var s = getSettings();

		if (s && s.app_id) {
			this._appId = s.app_id;
			this._appKey = s.app_key;
			getAccessToken();
		}
	}
	
	BuddyClient.prototype.registerDevice = function(appId, appKey, callback){
		if (getAccessToken()) {
			callback && callback();
			return;
		}

		var self = this;
		
		var cb = function (err, r) {
		    if (r.success) {
		        self._appId = appId || self._appId;
		        self._appKey = appKey || self._appKey;
				var newSettings = {app_id: self._appId, app_key: self._appKey};
				if(r.result.serviceRoot)
				{
					newSettings["serviceRoot"] = r.result.serviceRoot;
				}
		        updateSettings(newSettings);
		        setAccessToken("device", r.result);
		        self._output && self._output.log && self._output.log("Device Registration Complete.");
		        callback && callback(err, r);
		    }
		    else {
		        processResult(r, callback);
		    }

		};

		cb._printResult = !callback;

		return this.post("/devices", {
			appID: appId || this._appId,
			appKey: appKey || this._appKey,
			platform: this._settings.platform || "Javascript",
			model: navigator.userAgent,
			uniqueId: getUniqueId()
		},cb, true)
	}
	
	BuddyClient.prototype.getUser = function(callback) {

		var s = getSettings();

		if (!s.user_id) {
			return callback && callback();
		}

		if (callback) {

			this.get("/users/me", function(err, r){

				callback && callback(err, r.result);
			});
		}

		return s.user_id;
	}

	BuddyClient.prototype.loginUser = function(username, password, callback) {
		var cb = function(err, r){
			if (r.success) {
				var user = r.result;
				updateSettings({
					user_id: user.id
				});

				setAccessToken('user', user);
			
			}
			callback && callback(err, r && r.result);
		};

		cb._printResult = !callback;

		return this.post("/users/login", {
			username: username,
			password: password
		}, cb);
		
	}

	BuddyClient.prototype.logoutUser = function(callback) {
		var s = getSettings();
		var userId = s.user_id;

		if (!userId) {
			return callback && callback();
		}

		return this.post('/users/me/logout', function(){

				clearSettings({
					user: true
				})

				callback && callback();
		});
	}

	BuddyClient.prototype.createUser = function(options, callback) {
		if (!options.username || !options.password) {
			throw new Error("Username and password are required.");
		}

		return this.post("/users", options, function(err, r){

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

	BuddyClient.prototype.recordMetricEvent = function(eventName, values, timeoutInSeconds, callback) {
		if (typeof timeoutInMinutes == 'function') {
			callback = timeoutInMinutes;
			timeoutInMinutes = null;
		}

		var cb = function(err, result){
			if (err) {
				callback && callback(err);
			}
			else if (timeoutInSeconds && result.result) {
				var self = this;
				var r2 = {
					 finish: function(values2, callback2){
					 	if (typeof values2 == 'function') {
					 		callback2 = values2;
					 		values2 = null;
					 	}
						self.DELETE(
							'/metrics/events/' + result.result.id, 
							{
									values: values
							}, 
							function(err){
								callback2 && callback2(err);
							});
					}
				};
				callback && callback(null, r2);
			}
			else {
				callback && callback(err, result);
			}
		};
		cb._printResult = !callback;

		return this.post("/metrics/events/" + eventName, {
			values: values,
			timeoutInSeconds: timeoutInSeconds
		}, cb);
	}
	
	BuddyClient.prototype.processResult = function(result, callback) {
		this._requestCount--;
		
		result.success = !result.error;

		if (result.error) {
			var err = new Error(result.message || result.error);
			err.error = result.error;
			err.errorNumber = result.errorNumber;
			err.status = result.status;

			callback && callback(err, result);
			if (!callback || callback._printResult) {
				this._output && this._output.warn && this._output.warn(JSON.stringify(result,  null, 2));
				$.event.trigger({
					type: "BuddyError",
					buddy: result
				});
			}
		}
		else {
			convertDates(result.result);
			callback && callback(null, result);
			if (!callback || callback._printResult) {
				this._output && this._output.log && this._output.log(JSON.stringify(result,  null, 2));
			}
		}
	}
	
	BuddyClient.prototype.makeRequest = function(method, url, parameters, callback, noAutoToken) {
		if (!method || !url) {
			throw new Error("Method and URL required.")
		}
		method = method.toUpperCase();

		if (typeof parameters == 'function') {
			callback = parameters;
			parameters = null;
		}

		// see if we've already got an access token
		var at = this.getAccessToken();
		
		if (at && !this._appKey) {
			return callback(new Error("Init must be called first."))
		}
		else if (!at && !noAutoToken) {
			// if we don't have an access token, automatically get the device
			// registered, then retry this call.
		    //
		    var cb = function (err, r1) {
		        if (!err && r1.success) {
		            at = this.getAccessToken();

		            if (at) {
		                this.makeRequest(method, url, parameters, callback);
		                return;
		            }
		        }
		        else {
		            callback(err);
		        }
		    };
		    cb._printResult = false;
			this.registerDevice(null, null, cb)
			return;
		}

		// we love JSON.
		var headers = {
				"Accept" : "application/json"
		};

		// if it's a get, encode the parameters
		// on the URL
		//
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

				if (method == "GET") {
					throw new Error("Get does not support file parameters.");
				}

				if (!FormData) {
					throw new Error("Sorry, this browser doesn't support FormData.");
				}

				// for any file parameters, build up a FormData object.

				// should we make this "multipart/form"?
				delete headers["Content-Type"];

				var formData = new FormData();

				// push in any file parameters
                for (var p in fileParams) {
                        formData.append(p, fileParams[p]);
                }

                // the rest of the params go in as a single JSON entity named "body"
                //
                if (nonFileParams) {
	                formData.append("body", new Blob([JSON.stringify(nonFileParams)], {type:'application/json'}));
	            }
                parameters = formData;

			}
			else {
				// if we just have normal params, we stringify and push them into the body.
				parameters = nonFileParams ? JSON.stringify(nonFileParams) : null;
			}
		}
		
		// OK, let's make the call for realz
		//
		var s = getSettings();
		var r = s.root || root;
		
		var self = this;
	    $.ajax({
	        method: method,
            type: method,
			url: r + url,
			headers: headers,
			contentType: false,
			processData: false,
			data: parameters,
            success:function(data) {
				self.processResult(data, callback);
			},
			error: function(data, status, response) {

				// check our error states, then continue to process result
				if (data.status === 0) {
					data = {
						status: 0,
						error: "NoInternetConnection",
						errorNumber: -1
					};
					console.warn("ERROR: Can't connect to Buddy Platform (" + r + ")");
					self._settings && self._settings.connectionStateChanged && defer(self._settings.connectionStateChanged);
				}
				else {
					data = JSON.parse(data.responseText);
					switch (data.errorNumber) {
						case AuthErrors.AuthAccessTokenInvalid:
						case AuthErrors.AuthAppCredentialsInvalid:
							// if we get either of those, drop all our app state.
							// 
							clearSettings();
							break;
						case AuthErrors.AuthUserAccessTokenRequired:
							clearSettings({user:true});
							self._settings && self._settings.loginRequired && defer(self._settings.loginRequired);
							break;
					}
				}
				self.processResult(data, callback);
			}
		});
		return 'Waiting for ' + url + "..."
	}

	BuddyClient.prototype.get = function(url, parameters, callback, noAuto) {
		return this.makeRequest("GET", url, parameters, callback, noAuto);
	}

	BuddyClient.prototype.post = function(url, parameters, callback, noAuto) {
		return this.makeRequest("POST", url, parameters, callback, noAuto);
	}

	BuddyClient.prototype.put = function(url, parameters, callback, noAuto) {
		return this.makeRequest("PUT", url, parameters, callback, noAuto);
	}

	BuddyClient.prototype.patch = function(url, parameters, callback, noAuto) {
		return this.makeRequest("PATCH", url, parameters, callback, noAuto);
	}

	BuddyClient.prototype.delete = function(url, parameters, callback, noAuto) {
		return this.makeRequest("DELETE", url, parameters, callback, noAuto);
	}

	BuddyClient.prototype.getUniqueId = function() {
		var s = getSettings();

		if (!s.unique_id) {
			
			s = updateSettings({
				unique_id: this._appId + ":" +new Date().getTime() // good enough for this
			})
		}
		
		return s.unique_id;
	}

	BuddyClient.prototype.socialLogin = function(identityProviderName, identityID, identityAccessToken, callback){
		var cb = function(err, r){
			if (r.success) {
				var user = r.result;
				updateSettings({
					user_id: user.id
				});

				setAccessToken('user', user);
			}
			callback && callback(err, r && r.result);
		};

		cb._printResult = !callback;

		return this.post("/users/login/social", {
			identityID: identityID,
			identityProviderName: identityProviderName,
			identityAccessToken: identityAccessToken
		}, cb);
	}


	getSettings = function(force) {
		return _client.getSettings(force);
	}

	updateSettings = function(updates, replace) {
		return _client.updateSettings(updates, replace);
	}

	clearSettings = function(type) {
		return _client.clearSettings(type);
	}

	getUniqueId = function() {
		return _client.getUniqueId();
	}

	getAccessToken = function() {
		return _client.getAccessToken();
	}

	setAccessToken = function(type, value) {
		return _client.setAccessToken(type, value);
	}

	_calculateClientKey = function(appId, options){
		return appId + options.instanceName;
	}
	
	
	_clients = [];
	_client = null;
	
	init = function(appId, appKey, options) {
		if (!appId) throw new Error("appId and appKey required");
		
		var clientKey = _calculateClientKey(appId, options);
		
		if(!_clients[clientKey]){
			_clients[clientKey] = new BuddyClient(appId, appKey, options);
		}
		
		_client = _clients[clientKey];
		
		return _client;
	}

	clear = function() {
		_client.clearSettings();
	}

	// HELPER METHODS -
	// We wrap a few common operations.
	registerDevice = function(appId, appKey, callback) {
		return _client.registerDevice(appId, appKey, callback);
	}

	getUser = function(callback) {
		return _client.getUser(callback);
	}

	Object.defineProperty(this, "accessToken", {
	    get: function() {
	        return _client.getAccessToken();
	    }
	});

	loginUser = function(username, password, callback) {
		return _client.loginUser(username, password, callback);
	}

	socialLogin = function(identityProviderName, identityID, identityAccessToken, callback) {
		return _client.socialLogin(identityProviderName, identityID, identityAccessToken, callback);
	}

	logoutUser = function(callback) {
		return _client.logoutUser(callback);
	}

	createUser = function(options, callback) {
		return _client.createUser(options, callback);
	}

	// Record an 
	recordMetricEvent = function(eventName, values, timeoutInSeconds, callback) {
		return _client.recordMetricEvent(eventName, values, timeoutInSeconds, callback);
	}

	// just let things unwind a bit, mmk?
	defer = function(callback) {
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

	//
	// Convert dates format like /Date(124124)/ to a JS Date, recursively
	//
	convertDates = function(obj, seen) {
		seen = seen || {};

		if (!obj || seen[obj]) {
			return;
		}

		// prevent loops
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

	//
	// The main caller request, handles call setup and formatting,
	// authentication, and basic error conditions such as triggering the login
	// callback or no internet callback.
	//
	makeRequest = function(method, url, parameters, callback, noAutoToken) {
		return _client.makeRequest(method, url, parameters, callback, noAutoToken);
	}

	get = function(url, parameters, callback, noAuto) {
		return makeRequest("GET", url, parameters, callback, noAuto);
	}

	post = function(url, parameters, callback, noAuto) {
		return makeRequest("POST", url, parameters, callback, noAuto);
	}

	put = function(url, parameters, callback, noAuto) {
		return makeRequest("PUT", url, parameters, callback, noAuto);
	}

	patch = function(url, parameters, callback, noAuto) {
		return makeRequest("PATCH", url, parameters, callback, noAuto);
	}
	
	
	
	return this;
}();

Buddy.delete = function(url, parameters, callback, noAuto) {
		return makeRequest("DELETE", url, parameters, callback, noAuto);
	}