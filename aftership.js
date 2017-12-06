var aftership = require('aftership')
var moment = require('moment')

module.exports = function(RED) {
	var services = {}
	var packages = {}

	function AftershipConfig(config) {
		var self = this
		RED.nodes.createNode(self, config)

		self.config = {
			name: config.name,
			key: config.key,
			interval: config.interval,
			onstart: config.onstart
		}

		self.aftership = aftership(self.config.key)
		self.packages = {}
		self.latestUpdate = moment()
		self.updated = false
		self.inited = false

		self.updateStatus = function(status) {
			if (status.state === 'load') {
				self.emit('statusUpdate', {
					fill: 'yellow',
					shape: 'ring',
					text: 'Requesting'
				})
			} else if (status.state === 'error') {
				self.emit('statusUpdate', {
					fill: 'red',
					shape: 'ring',
					text: 'Error'
				})
			} else {
				self.emit('statusUpdate', {
					fill: 'green',
					shape: 'dot',
					text: 'Ready'
				})
			}
		}

		self.load = function() {
			self.updated = false
			self.updateStatus({ state: 'load' })
			self.aftership.call('GET', '/trackings', function(err, resp) {
				if (err) {
					self.updateStatus({
						state: 'error',
						msg: err
					})
				} else {
					self.packages = resp.data.trackings
					self.packages = self.packages.map(function(x) {
						x.updated = moment(x.updated_at) > self.latestUpdate
						if (x.updated) {
							self.updated = true
							self.emit('notify', x)
						}
						return x
					})
					self.latestUpdate = moment()
					if (self.updated || !self.inited) {
						self.emit('update')
					}
					self.inited = true
					self.updateStatus({ state: 'done' })
				}
			})
		}

		if (self.config.onstart) {
			self.load()
		}

		setInterval(self.load, self.config.interval * 3600)
		services[self.id] = self
	}

	RED.nodes.registerType('aftership-config', AftershipConfig)

	function AftershipIn(n) {
		var self = this
		RED.nodes.createNode(self, n)

		var service = services[n.service]

		self.on('input', function(msg) {
			var tracking_number = msg.payload
			var slug = msg.payload.slug
			var tracking_number = msg.payload.tracking_number

			if (!slug) self.error('No carrier specified (dhl, ups, ...)')
			if (!tracking_number) self.error('No tracking number specified')

			var body = {
				'tracking': {
					'slug': slug,
					'tracking_number': tracking_number
				}
			}

			service.aftership.call('POST', '/trackings', { body }, function(pErr, pResp) {
				self.send(msg)
				if (pErr) {
					self.error(pErr)
				} else {
					msg.payload = pResp.data.tracking
					self.send(msg)
				}
			})
		})
	}

	RED.nodes.registerType('aftership-in', AftershipIn)

	function AftershipGet(n) {
		var self = this
		RED.nodes.createNode(self, n)

		var service = services[n.service]

		self.on('input', function(msg) {
			var tracking_number = msg.payload
			var slug = msg.payload.slug
			var tracking_number = msg.payload.tracking_number

			if (!slug) self.error('No carrier specified (dhl, ups, ...)')
			if (!tracking_number) self.error('No tracking number specified')

			service.aftership.call('GET', '/trackings/'+ slug +'/'+ tracking_number, function(err, resp) {
				if (err && err.code === 4004) {
					msg.payload = {}
					self.send(msg)
				} else {
					if (err) {
						self.error(err)
					} else {
						msg.payload = resp.data.tracking
						self.send(msg)
					}
				}
			})
		})
	}

	RED.nodes.registerType('aftership-get', AftershipGet)

	function AftershipOut(n) {
		var self = this
		RED.nodes.createNode(self, n)

		var service = services[n.service]

		service.on('update', function() {
			var msg = {}
			msg.payload = service.packages
			self.send(msg)
		})

		service.on('statusUpdate', function(status) {
			self.status(status)
		})
	}

	RED.nodes.registerType('aftership-out', AftershipOut)

	function AftershipNotify(n) {
		var self = this
		RED.nodes.createNode(self, n)

		var service = services[n.service]

		service.on('notify', function(p) {
			var msg = {}
			msg.payload = p
			self.send(msg)
		})

		service.on('statusUpdate', function(status) {
			self.status(status)
		})
	}

	RED.nodes.registerType('aftership-notify', AftershipNotify)
}
