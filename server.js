/*
AttnRobot - v0.4, June 8th 2013

ChangeLog:
	- 08/06/2013 sends out all emails when anyone in the group books some attn during the day, rather than choosing on a personal level
	- 05/06/2013 got rid of personal percentage as it wasn't helpful and added group totals
*/

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
	formatDuration = function(duration) {
		var hours,
			minutes,
			seconds;
		seconds = duration / 1000;
		minutes = seconds / 60;
		hours = Math.floor(minutes / 60);
		minutes = Math.floor(minutes % 60);
		seconds = Math.floor(seconds % 60);
		return {
			hours: hours,
			minutes: minutes,
			seconds: seconds
		};
	},
	periodsToText = function(periods, textAndTotal) {
		var i,
			textLines = [],
			text = "",
			period,
			startTime,
			endTime,
			format = "HH:mm",
			total = 0;
		// run through the periods backwards as we want to show the most recent first
		for(i=periods.length-1;i>=0;i--) {
			period = periods[i];
			total += period.duration || 0;
			startTime = period.startDate.toString(format);
			endTime = period.endDate ? period.endDate.toString(format) : "(open)";
			textLines.push(startTime+"-"+endTime+" / "+period.project+ (period.notes ? " / "+period.notes : ""));
		}
		console.log('total', total);
		totalObj = formatDuration(total);
		textLines.push("<br>");
		textLines.push("Your total for today is: "+totalObj.hours+"h "+totalObj.minutes+"m");
		text = textLines.join("<br>");

		// set properties of the object passed in
		textAndTotal.text = text;
		textAndTotal.total = total;
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
					textAndTotal = {
						text: "",
						total: 0
					};
				console.log('today: '+today);
				console.log('most recent period: '+todayPeriods.date);
				// NB: option for the future, perhaps set todayPeriods to null if today's date isn't the same as the todayPeriods's date, and call periodsToText anyway to make the email text consistent e.g. it would say "your time today is 0h"
				if(todayPeriods.date===today) {
					console.log('converting periods, count ',todayPeriods.periods.length);
					periodsToText(todayPeriods.periods, textAndTotal); // this modifies textAndTotal
				}
				callback(textAndTotal);
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
		todayText,
		testMode = process.env.USER==="jonathanlister",
		groupTotal = 0,
		emails = {},
		createGroupRundown = function() {
			var breakdown = [],
				total,
				totalObj;
			for(name in emails) {
				if(emails.hasOwnProperty(name)) {
					total = emails[name].total;
					totalObj = formatDuration(total);
					breakdown.push(name+": "+totalObj.hours+"h "+totalObj.minutes+"m");
				}
			}
			breakdown = breakdown.join("<br>");
			return breakdown;
		},
		sendAllEmails = function() {
			var name,
				text,
				email,
				personalPercentage,
				groupRundown = createGroupRundown();
			for(name in emails) {
				if(emails.hasOwnProperty(name)) {
					email = emails[name];
					/*personalPercentage = Math.round((email.total / groupTotal)*100);
					text = email.text+"<br>You were "+personalPercentage+"% of today's total for the group.";*/
					text = email.text+"<br>Group totals:<br>"+groupRundown;
					output += text+"<br><br>";
					console.log('text for '+name+': '+text);
					if(!testMode) {
						sendTheEmail(name, text);
					}
				}
			}
		};
	
	getTodayFor('jnthnlstr', function(textAndTotal) {
		emails['jnthnlstr@gmail.com'] = {
			text: textAndTotal.text,
			total: textAndTotal.total
		};
		groupTotal += textAndTotal.total;
	
		getTodayFor('csugden', function(textAndTotal) {
			emails['csugden@gmail.com'] = {
				text: textAndTotal.text,
				total: textAndTotal.total
			};
			groupTotal += textAndTotal.total;
	
			getTodayFor('joshuwar', function(textAndTotal) {
				emails['josh.u.war@gmail.com'] = {
					text: textAndTotal.text,
					total: textAndTotal.total
				};
				groupTotal += textAndTotal.total;
				if(groupTotal) {
					sendAllEmails();				
				}
				res.send(output);
			});
		});
	});
});

var port = process.env.PORT || 8001;

app.listen(port);
console.log('Listening on port '+port);
