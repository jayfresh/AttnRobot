/*
AttnRobot - v0.0.6, June 24th 2013

ChangeLog:
	- 24/06/2013 adds 7-day summary section at bottom of email
	- 11/06/2013 adds the projects to the group breakdown so everyone can see what the projects that were worked on are
		- feedback on previous addition - good to see what other people are doing. Feels like a "panopticon", but in a good way!
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
			byDate = {},
			day,
			periodDay,
			period,
			i,
			oneWeekAgo = new Date();
		oneWeekAgo.setHours(0);
		oneWeekAgo.setSeconds(0);
		oneWeekAgo.setMilliseconds(0);
		oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
		format = format || "ddMMyyyy";
		if(!periods || periods.length===0) {
			return [];
		}
		for(i=0;i<periods.length;i++) {
			// assume the periods are ordered by date
			period = periods[i];
			// only include periods from the last 7 days
			if(period.startDate>oneWeekAgo) {
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
					// this marks a change of day
					days.push(day);
					day = {
						date: periodDay,
						periods: [period]
					};
				}
				// by this point, day will have been updated to contain the correct properties
				// it's a bit redundant to always set the day property, but it's not too bad
				byDate[periodDay] = day;
			}
		}
		days.push(day);
		return {
			days: days,
			byDate: byDate
		};
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
	periodsToText = function(periods, personPeriods) {
		var i,
			textLines = [],
			text = "",
			period,
			startTime,
			endTime,
			format = "HH:mm",
			total = 0,
			projects = [];
		// run through the periods backwards as we want to show the most recent first
		for(i=periods.length-1;i>=0;i--) {
			period = periods[i];
			total += period.duration || 0;
			projects.pushUnique(period.project);
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
		personPeriods.text = text;
		personPeriods.total = total;
		personPeriods.projects = projects;
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
					daysObj = daysFromPeriods(periods),
					days = daysObj.days,
					// today is the last day in the days array
					todayPeriods = days[days.length-1],
					today = (new Date).toString("ddMMyyyy"),
					personPeriods = {
						text: "",
						total: 0,
						lastWeekPeriodsByDate: daysObj.byDate,
						projects: []
					};
				console.log('***daysObj***');
				console.log(daysObj);
				console.log('today: '+today);
				console.log('most recent period: '+todayPeriods.date);
				// NB: option for the future, perhaps set todayPeriods to null if today's date isn't the same as the todayPeriods's date, and call periodsToText anyway to make the email text consistent e.g. it would say "your time today is 0h"
				if(todayPeriods.date===today) {
					console.log('converting periods, count ',todayPeriods.periods.length);
					periodsToText(todayPeriods.periods, personPeriods); // this modifies personPeriods
				}
				callback(personPeriods);
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
		today = (new Date).getDay(),
		isEndOfWeek = today===5, // 5 is Friday
		groupTotal = 0,
		emails = {},
		createGroupRundown = function() {
			var breakdown = [],
				total,
				totalObj,
				name;
			for(name in emails) {
				if(emails.hasOwnProperty(name)) {
					total = emails[name].total;
					projects = emails[name].projects;
					totalObj = formatDuration(total);
					breakdown.push(name+": "+totalObj.hours+"h "+totalObj.minutes+"m"+(projects.length ? " / " : "")+projects.join(" / "));
				}
			}
			if(isEndOfWeek || testMode) {
				// append a table with the week's data
				var tablePieces = ['<h3>7 day summary</h3><table><thead><tr><th>Person</th>'],
					tableHTML = "",
					days,
					dayPeriods,
					periodsByDate,
					dayTotal,
					weekTotal,
					i,
					j,
					d = new Date(), // should probably copy 'today'
					week = [],
					format = "ddMMyyyy";
				d.setDate(d.getDate()-7);
				for(i=7;i>0;i--) {
					d.setDate(d.getDate()+1);
					week.push(d.toString(format));
					tablePieces.push('<th>'+d.toString('ddd')+'</th>');
				}
				tablePieces.push('<th>Total</th></tr></thead><tbody>');
				console.log(week);
				for(name in emails) {
					if(emails.hasOwnProperty(name)) {
						tablePieces.push('<td>'+name+'</td>');
						weekTotal = 0;
						days = emails[name].lastWeekPeriodsByDate;
						/* TO-DO: make this bit make use of a function, as it's very similar to above - see periodsToText */
						for(i=0;i<week.length;i++) {
							day = days[week[i]];
							if(day) {
								console.log('DAY',day);
								dayPeriods = day.periods;
								dayTotal = 0;
								for(j=dayPeriods.length-1;j>=0;j--) {
									period = dayPeriods[j];
									dayTotal += period.duration || 0;
								}
								totalObj = formatDuration(dayTotal);
								tablePieces.push('<td>'+totalObj.hours+":"+totalObj.minutes+'</td>');
								weekTotal += dayTotal;
							} else {
								console.log('NO DAY for',week[i]);
								tablePieces.push('<td>0:0</td>');
							}
						}
						totalObj = formatDuration(weekTotal);
						tablePieces.push('<td>'+totalObj.hours+":"+totalObj.minutes+'</td></tr><tr>');
					}
				}
				tablePieces.push('</tr></tbody></table>');
				tableHTML = tablePieces.join('');
				
			}
			breakdown.push(tableHTML);
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
	
	getTodayFor('jnthnlstr', function(personPeriods) {
		emails['jnthnlstr@gmail.com'] = personPeriods;
		groupTotal += personPeriods.total;
	
		getTodayFor('csugden', function(personPeriods) {
			emails['csugden@gmail.com'] = personPeriods;
			groupTotal += personPeriods.total;
	
			getTodayFor('joshuwar', function(personPeriods) {
				emails['josh.u.war@gmail.com'] = personPeriods;
				groupTotal += personPeriods.total;
				if(groupTotal) {
					sendAllEmails();				
				}
				res.send(output);
			});
		});
	});
});

Array.prototype.pushUnique = function(item) {
	if(this.indexOf(item)===-1) {
		this.push(item);
	}
};

var port = process.env.PORT || 8001;

app.listen(port);
console.log('Listening on port '+port);
