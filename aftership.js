var aftership = require('aftership')

module.exports = function(RED) {
	var services = {}

	function AftershipConfig(config) {
		var self = this
		RED.nodes.createNode(self, config)

		self.config = {
			name: config.name,
			key: config.key
		}

		self.aftership = aftership(self.config.key)
		services[self.id] = self
	}

	RED.nodes.registerType('aftership-config', AftershipConfig)

	function Aftership(n) {
		var self = this
		RED.nodes.createNode(self, n)

		var service = services[n.service]

		self.on('input', function(msg) {
			var tracking_number = msg.payload
			var slug = msg.payload.slug
			var tracking_number = msg.payload.tracking_number

			if (!slug) self.error('No spediteur specified (dhl, ups, ...)')
			if (!tracking_number) self.error('No tracking number specified')

			service.aftership.call('GET', '/trackings/'+ slug +'/'+ tracking_number, function(err, resp) {
				if (err && err.code === 4004) {
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

	RED.nodes.registerType('aftership', Aftership)
}
