var request = require('request'),
	nodemailer = require("nodemailer"),
	express = require('express'),
	datejs = require('datejs'),
	app = express(),
	smtpTransport = nodemailer.createTransport("SMTP", {
	    service: "SendGrid", // sets automatically host, port and connection security settings
	    auth: {
	        user: "jayfresh",
	        pass: "temp123"
	    }
	}),
	sendTheEmail = function(toAddress, body) {
		smtpTransport.sendMail({
			to: toAddress,
			from: "robot@attnbang.com",
			subject: "Do you want to book any more time?",
			html: body,
			generateTextFromHTML: true
		}, function(err, result) {
			if(err) {
				console.log(err);
			}
		});
	},
	parseToTiddlers = function(tiddlers) {
		tiddlers = tiddlers || [];
		var attnTiddlers = [],
			periods,
			tiddler,
			i;
		console.log(typeof tiddlers);
		console.log(tiddlers.length);
		for(i=0;i<tiddlers.length;i++) {
			tiddler = tiddlers[i];
			if(tiddler.tags.indexOf('attn')!==-1) {
				attnTiddlers.push(tiddler);
			}
		}
		return attnTiddlers;
	},
	createPeriods = function(tiddlers, periodCallback) {
		var periods = [],
			period,
			epoch,
			savePeriod = function(p) {
				if(periodCallback) {
					periodCallback.call(p);
				}
				periods.push(p);
				period = null;
			},
			i,
			tid,
			project,
			notes;
		// we are assuming the tiddlers are sorted by date, earliest last
		for(i=tiddlers.length-1;i>=0;i--) {
			tid = tiddlers[i];
			project = getProject(tid);
			epoch = parseInt(tid.title,10);
			notes = tid.text;
			if(project!=='off') {
				if(period) {
					// end the period here and start a new one
					period.end = epoch;
					period.endDate = new Date(epoch);
					period.duration = period.end - period.start;
					savePeriod(period);
					period = {
						start: epoch,
						startDate: new Date(epoch),
						project: project
					};
					if(notes) {
						period.notes = notes;
					}
				} else {
					// start a new period
					period = {
						start: epoch,
						startDate: new Date(epoch),
						project: project
					};
					if(notes) {
						period.notes = notes;
					}
				}
			} else {
				if(period) {
					// end the period here
					period.end = epoch;
					period.endDate = new Date(epoch);
					period.duration = period.end - period.start;
					savePeriod(period);
				} else {
					// two offs in a row, so a period of zero duration
					savePeriod({
						start: epoch,
						startDate: new Date(epoch),
						end: epoch,
						endDate: new Date(epoch),
						duration: 0,
						project: 'off'
					});
				}
			}
		}
		if(period) { // create an unfinished period
			savePeriod(period);
		}
		return periods;
	},
	getProject = function(tiddler) {
		var project,
			projectPrefix = "project:",
			tag,
			i;
		if(!tiddler.tags) {
			return;
		}
		for(i=0;i<tiddler.tags.length;i++) {
			tag = tiddler.tags[i];
			if(tag.indexOf(projectPrefix)===0) {
				project = tag.substring(projectPrefix.length);
				break;
			}
		}
		return project;
	},
	daysFromPeriods = function(periods,format) {
		var days = [],
			day,
			periodDay,
			period,
			i;
		format = format || "ddMMyyyy";
		if(!periods || periods.length===0) {
			return [];
		}
		for(i=0;i<periods.length;i++) {
			period = periods[i];
			periodDay = period.startDate.toString(format);
			if(!day) {
				day = {
					date: periodDay,
					periods: []
				};
			}
			if(day.date===periodDay) {
				day.periods.push(period);
			} else {
				days.push(day);
				day = {
					date: periodDay,
					periods: [period]
				};
			}
		}
		days.push(day);
		return days;
	},
	periodsToText = function(periods) {
		var i,
			textLines = [],
			text = "",
			period,
			startTime,
			endTime,
			format = "HH:mm";
		// run through the periods backwards as we want to show the most recent first
		for(i=periods.length-1;i>=0;i--) {
			period = periods[i];
			startTime = period.startDate.toString(format);
			endTime = period.endDate.toString(format);
			textLines.push(startTime+"-"+endTime+" / "+period.project+ (period.notes ? " / "+period.notes : ""));
		}
		text = textLines.join("<br>");
		return text;
	},
	getTodayFor = function(username, callback) {
		var url = "http://attn-test.tiddlyspace.com/search.json?q=bag:attn_"+username+"_*%20_limit:50&fat=1&sort=-title",
			options = {
				headers: {
					'X-ControlView': false
				},
				json: true
			};
		request.get(url, options, function(error, response) {
			console.log('GET url: '+url);
			if(error) {
				res.send(error);
			} else {
				var body = response.body,
					tiddlers = parseToTiddlers(body),
					periods = createPeriods(tiddlers),
					days = daysFromPeriods(periods),
					// today is the last day in the days array
					todayPeriods = days[days.length-1],
					today = (new Date).toString("ddMMyyyy"),
					text;
				console.log('today: '+today);
				console.log('most recent period: '+todayPeriods.date);
				if(todayPeriods.date===today) {
					text = periodsToText(todayPeriods.periods);
				}
				callback(text);
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
	console.log('running');
	var output = "",
		todayText;
	
	getTodayFor('jnthnlstr', function(todayText) {
		if(todayText) {
			output += todayText;
			sendTheEmail('jnthnlstr@gmail.com', todayText);
		}
	
		getTodayFor('csugden', function(todayText) {
			if(todayText) {
				output += "<br>"+todayText;
				sendTheEmail('csugden@gmail.com', todayText);
			}
	
			getTodayFor('joshuwar', function(todayText) {
				if(todayText) {
					output += "<br>"+todayText;
					sendTheEmail('josh.u.war@gmail.com', todayText);
				}
				res.send(output);
			});
		});
	});
});

var port = process.env.PORT || 8001;

app.listen(port);
console.log('Listening on port '+port);
