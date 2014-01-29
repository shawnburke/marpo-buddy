

Buddy.init(creds.appid, creds.appkey, {root: window.service_root});


var MarpoRouter = Backbone.Router.extend({

  routes: {
    "":                 "home",    // #help
    "login":        "login",  
    "checkin": "checkin",
    "details/:id" :"details",
  },
  initialize: function(options){
  	this._targetSelector = options.targetSelector;
  },
  go: function(path) {
  		this.navigate(path, {trigger:true})
  },
  home: function() {
   	var view = new HomeView({el:this._targetSelector});

  	view.render();
  },
  login:function() {
  	var view = new LoginView({el:this._targetSelector});

  	view.render();
  },
  details: function(id) {
    var view = new CheckinDetailView({el: this._targetSelector, id: id})
    view.render();
  },
  checkin: function() {

  	var view = new AddCheckinView({el: this._targetSelector});
  	view.render();
  },
  checkAuth: function(nav) {
  		// do we have a user.
		var userId = Buddy.getUser();

		if (!userId) {
			$('.auth').hide();
			$('.no-auth').show();
			
			this.go("login");
		}
		else {
			$('.auth').show();
			$('.no-auth').hide();
			if (nav) {
				this.go("");
			}
		}
  }

});


var templateHtml = {}

function getTemplate(name, values) {

	var template = templateHtml[name];
	if (!template) {
		var el = $('#' + name);

		template = el.html();
		if (template) {
			template = _.template(template);
			templateHtml[name] = template;
		}
		else {
			console.error("Coudln't find template: " + name);
		}
	}

	if (!template) return "";

	var html = template({value:values});

	return html;

}


var router = new MarpoRouter({targetSelector:'.view-target'});



var TemplatedView = Backbone.View.extend({

	initialize: function(args){
		this.__super = Backbone.View.prototype;

		this._super("initialize", arguments);
	},
	_super: function(method, arguments) {
		var args = Array.prototype.slice.call(arguments, 1);
		return this.__super[method].apply(this, args);
	},
	getValue: function() {
		return null;
	},
	renderTemplate: function(values, replace) {
		if (_.isUndefined(replace) && _.isBoolean(values)) {
			replace = values;
			values = null;
		}

		var html = getTemplate(this.template, values);

		html = $(html);
		if (replace) {
			this.$el.html(html);
		}
		return html;
	},
	render: function() {
		this.renderTemplate(this.getValue(), true);
		return this;
	}
})

var LoginView = TemplatedView.extend({
	events: {
		'click button[type=submit]' : "_loginClick"
	},
	template: "login_template",
	_loginClick: function() {

		var el = $(".tab-pane.active", this.$el);


		function finish(err, user) {

	
			if (user) {
				router.checkAuth(true);
			}
			else {
				$('.error', el).text(err.message);
			}
		}
		
		
		var email = $('#email', el).val();
		var pwd = $('#password', el).val();
		var self = this;


		var isSignup = el.attr('id') == 'signup';

		if (isSignup) {
			var firstname = $('#firstname', el).val();
			var lastname = $('#lastname', el).val();

			Buddy.createUser({
				firstname: firstname,
				lastname: lastname,
				email: email,
				username: email,
				password: pwd
			}, finish)

		}
		else {
			Buddy.loginUser(email, pwd, finish);
		}
		return false;

	}

});


function getLocation(callback) {

	if (navigator.geolocation) {
		try {

			navigator.geolocation.getCurrentPosition(function(l){

				if (l && l.coords) {
					return callback(null, l.coords);
				}
				else {
					return callback(new Error("InvalidLocation"));
				}

			});
		}
		catch(err) {
			callback(err);
		}
	}

}


var MapItemView = Backbone.View.extend( {

	_ensureMap: function() {

		if (!this._map) {

			var mapCanvas = $('.map-canvas', this.$el);

			if (mapCanvas.length) {
					var mapOptions = {
			          center: new google.maps.LatLng(this.center.latitude, this.center.longitude),
			          zoom: this.zoomLevel || 12
			        };

			        this._map = new google.maps.Map(
			        	mapCanvas[0],
			            mapOptions
					);

					this._renderMarkers();
				
			}
		}
		return this._map;
	},
	addMarkers: function(markers) {
		

		this._markers = this._markers || [];
		var self = this;

		_.each(markers, function(m){

			if (m.key && _.find(self._markers, function(m2){return m2.key && m2.key == m.key;})) {
				return;
			}

			self._markers.push(m);

		});
		this._renderMarkers();

		
	},
	clearMarkers: function() {

		_.each(this._markers, function(m){

			if (m.marker) {
				m.marker.setMap(null);
			}
		});
		this._markers = [];
	},
	_renderMarkers: function() {

		var map = this._ensureMap();
		_.each(this._markers, function(m){

			if (!m.marker && map) {
					var lat = m.latitude || m.location && m.location.latitude;
					var lng = m.longitude || m.location && m.location.longitude;

					// To add the marker to the map, use the 'map' property
					var marker = new google.maps.Marker({
					    position: new google.maps.LatLng(lat, lng),
					    map: map,
					    title: m.title || null
					});
					m.marker = marker;
			}
		});
	},
	setCenter: function(loc, zoom) {
		this._ensureMap();
		if (zoom) {
			this._map.setZoom(zoom);
		}
		this._map.panTo(new google.maps.LatLng(loc.latitude, loc.longitude));
	},
	render: function() {


		if (!this._ensureMap()) {
			return;
		}
		this._renderMarkers();

	}

});

var CheckinDetailView = TemplatedView.extend({
	template:"checkin_detail_template",
	initialize: function(args) {
		TemplatedView.prototype.initialize.apply(this, arguments);
		this.checkin = args.checkin;
		this.map = args.map;
		if (args.id) {
			var self = this;
			this.checkin = {id: args.id};
			Buddy.makeRequest("GET", '/checkins/' + args.id, function(err, r){

				if (r && r.success) {
					self.checkin = r.result;
					self.render();

					if (r.result.defaultMetadata) {

						Buddy.makeRequest("GET",'/pictures/' + r.result.defaultMetadata, {

								size:200
						}, function(err, r){
							if (r && r.success) {
								self.checkin.url  = r.result.signedUrl;
								self.render();
							}
						})

					}
				}

			});

		}
	},
	getValue: function() {
		return this.checkin;
	}

})

var CheckinItemView = TemplatedView.extend({
	events: {
		'click' : 'itemClick'
	},
	template: "checkin_item",
	initialize: function(args) {
		TemplatedView.prototype.initialize.apply(this, arguments);
		this.checkin = args.checkin;
		this.map = args.map;
	},
	getValue: function() {
		return this.checkin;
	},
	itemClick: function(e){
		var isdetails = $(e.target).attr('href');

		if (!isdetails) {
			this.map && this.map.setCenter(this.checkin.location);
			return false;
		}
	},
	render: function() {

		TemplatedView.prototype.render.apply(this, arguments);

		if (this.checkin && this.map) {
			this.map.addMarkers([{
				key: this.checkin.id,
				location: this.checkin.location,
				title: this.checkin.comment
			}]);
		}

		var self = this;
		function setImage(url) {
			$('.checkin-image', self.$el).html("<image src='" + url + "'/>")
			self.fileUrl = url;
		}

		if (this.checkin.defaultMetadata) {
			if (!this.fileUrl) {
				Buddy.makeRequest("GET",'/pictures/' + this.checkin.defaultMetadata, {

						size:50
				}, function(err, r){
					if (r && r.success) {
						setImage(r.result.signedUrl);
					}
				})
			}
			else {
				setImage(this.fileUrl);
			}
		}

		return this;
	}

});

var HomeView = TemplatedView.extend({
	template: "home_template",
	initialize: function(args) {
		 TemplatedView.prototype.initialize.apply(this, args);
		 
	},
	_getCheckins: function() {

		var checkinList = $('.checkins', this.$el);
		var self = this;
		Buddy.makeRequest("GET", '/checkins', function(err, result){

			if (!err && result.success) {
				var map;

				checkinList.empty();
				_.each(result.result.pageResults, function(ci){

					map = self.ensureMap(ci.location);
					
					var item = new CheckinItemView({
						checkin: ci,
						map: map
					});

					checkinList.append(item.render().$el);


				});

				if (map) {
					map.render();
				}
			}

		})

	},
	ensureMap: function(center) {
		var self = this;
		if ( !self.mapItemView) {
			self.mapItemView = new MapItemView( {
			 	el: self.$el
			 });
			self.mapItemView.zoomLevel = 14;
			self.mapItemView.center = center;
			self.mapItemView.render();
		}
		return self.mapItemView;
	},
	render: function() {

		var el = this.renderTemplate(false);
		var self = this;
		getLocation(
			function (err, loc) {	
				loc && self.ensureMap(loc);
			}
		);
		this.$el.html(el);

		this._getCheckins();
		return this;
	}
});

var AddCheckinView = TemplatedView.extend({

	events: {
		'click .add-checkin' : "_addCheckin"
	},
	template: 'new_checkin_template',
	_status: function(msg) {

		
		$('.status', this.$el).text(msg || "");
		
	},
	_addCheckin: function() {

		var self = this;
		this._status("Fetching location...");
		getLocation(function (err, loc) {	
				self._status("Uploading...");

				var l = loc.latitude + ',' + loc.longitude;
				
				function doCheckin(err, photoResult) {

					if (err) {
						return;
					}

					self._status("Creating Checkin...");
					
					Buddy.makeRequest("POST", "/checkins", {
								location: l,
								comment: $('#comment', self.$el).val() || null,
								description: $('#desc', self.$el).val() || null,
								defaultMetadata: photoResult && photoResult.result.id
							}, 
							function(err, result) {
								if (err) {
									self._status(err.message);
								}
								else {
									self._status();
									router.go('');
								}
							}
					);
				}

				var file = $('#image', self.$el);

				if (file.length && file[0].files && file[0].files.length) {
					self._status("Uploading Photo...");
					var fileItem = file[0].files[0];
					Buddy.makeRequest("POST", "/pictures",{
						data: fileItem,
						location: l
					}, doCheckin);
				}
				else {
					doCheckin();
				}
		
				
				
			}
		);

		return false;
	},
	render: function() {

		var el = this.renderTemplate(false);

		var self = this;

		getLocation(function(err, loc){

				if (!self.mapItemView) {
					self.mapItemView = new MapItemView( {
					 	el: self.$el
					 });
					self.mapItemView.zoomLevel = 14;
					self.mapItemView.center = loc;
					self.mapItemView.addMarkers([{

						latitude: loc.latitude,
						longitude: loc.longitude,

					}]);
					self.mapItemView.render();
				}
			}
		);
			this.$el.html(el);
		return this;
	

	}
	

});

var AppView = Backbone.View.extend({

	events: {
		'click .logout' : "_logout"	
	},
	initialize: function(args) {


	},
	load:function() {



	},
	_logout: function() {
		var self = this;
		Buddy.logoutUser(function(){
			router.checkAuth(true);
			self.render();
		});
		return false;
	},
	
	render: function() {

		// render any chrome
		//
		$('.loading').hide();

		// set up the nav pills active state
		//
		var hash = window.location.hash || '#';

		$('.menu .nav li').removeClass('active');

		var hashMatch = hash && hash.match(/[^\/]+/);
		if (hashMatch) {
			hash = hashMatch[0];
		}

		$('.menu a[href=' + hash + ']').parents('li').addClass('active');

		router.checkAuth(true);
	}


});




$(function() {


	var appView = new AppView({
		el:'.app-root'
	});

	Backbone.history.start();

	appView.render();


	


})