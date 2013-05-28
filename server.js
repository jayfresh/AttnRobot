var request = require('request'),
	nodemailer = require("nodemailer"),
	express = require('express'),
	app = express(),
	smtpTransport = nodemailer.createTransport("SMTP", {
	    service: "SendGrid", // sets automatically host, port and connection security settings
	    auth: {
	        user: "jayfresh",
	        pass: "temp123"
	    }
	}),
	sendTheEmail = function(body) {
		smtpTransport.sendMail({
			to: "jnthnlstr@gmail.com",
			from: "robot@attnbang.com",
			subject: "Do you want to book any more time?",
			html: body,
			generateTextFromHTML: true
		}, function(err, result) {
			if(err) {
				console.log(err);
			}
		});
	};


// set up the server

app.use(express.bodyParser());
app.get('/', function(req, res){
	var body = 'GET to /run to kickoff';
	res.send(body);
});
app.get('/run', function(req, res) {
	res.send('running');
	sendTheEmail('test body');
});

var port = process.env.PORT || 8001;

app.listen(port);
console.log('Listening on port '+port);
