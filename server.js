const ws = require("ws");
const MongoClient = require("mongodb").MongoClient;
const bcrypt = require("bcryptjs");

const port = process.env.PORT || 4521;

const wss = new ws.Server({ port });
if (wss) console.log(`listening on port ${port}`);

const mongoURL = "mongodb://localhost:27017/chat";
var dbo;

MongoClient.connect(
	mongoURL,
	{ useNewUrlParser: true, useUnifiedTopology: true },
	function(err, db) {
		if (err) throw err;
		dbo = db.db("chat");
		dbo.createCollection("messages", function(err, res) {
			if (err) throw err;
		});
		dbo.createCollection("lifeforms", function(err, res) {
			if (err) throw err;
		});
		console.log("mongo working");
	}
);

const defaultChannel = "general";

var channels = { [defaultChannel]: [] }; //list of people in a given channel
var loggedIn = []; //list of people online

wss.on("connection", ws => {
	ws.on("message", message => {
		let splitMessage = message.split(" ", 2);

		function sendLog(channel) {
			dbo
				.collection("messages")
				.find({ channel: channel }, { _id: 0 })
				.each((err, msg) => {
					if (err) throw err;
					if (msg)
						ws.send(`[${msg.timeStamp}] ${msg.userName}: ${msg.message}`);
				});
		}

		function postLogIn(channel) {
			ws.channel = channel;
			if (channels[channel].includes(ws.userName.toLowerCase())) {
				//no duplicate logins
				ws.userName = "";
				ws.channel = "";
				ws.passwd = "";
				ws.send("nah");
			} else {
				if (!channels[ws.channel]) channels[ws.channel] = [];
				loggedIn.push(ws.userName.toLowerCase());
				channels[ws.channel].push(ws.userName);
				ws.send("channel: " + ws.channel);
				wss.clients.forEach(client => {
					if (client !== ws && client.channel === ws.channel) {
						console.log("sent list request");
						client.send("list: " + channels[ws.channel].join(" "));
					}
				});
				console.log(ws.userName + " logged in");
			}
		}
		//login segment
		if (splitMessage[0] === "/name") {
			//username handling
			if (loggedIn.includes(ws.userName) && ws.channel) {
				// if this is a name change request then do that
				let oldName = ws.userName.toLowerCase();
				ws.userName = splitMessage[1].substr(23);
				dbo
					.collection("lifeforms")
					.findOne(
						{ userName: ws.userName.toLowerCase() },
						{ _id: 0 },
						(err, result) => {
							if (err) throw err;
							if (!result) {
								// if there is no other existing account by that name
								//update the arrays as well
								dbo
									.collection("lifeforms")
									.updateOne(
										{ userName: oldName },
										{ $set: { userName: ws.userName.toLowerCase() } },
										(err, res) => {
											if (err) throw err;
											channels[ws.channel].splice(
												channels[ws.channel].indexOf(oldName),
												1
											);
											channels[ws.channel].push(ws.userName.toLowerCase());
											loggedIn.splice(loggedIn.indexOf(oldName), 1);
											loggedIn.push(ws.userName.toLowerCase());
											ws.send("name changed to " + ws.userName);
											console.log(
												oldName + " changed their name to " + ws.userName
											);
										}
									);
							} else ws.send("same name");
						}
					);
			} else if (!splitMessage[1].match(/[^\S]+/)) {
				ws.userName = splitMessage[1];
			}
		} else if (ws.userName && splitMessage[0] === "/passwd") {
			//password handling
			ws.passwd = splitMessage[1];
			dbo
				.collection("lifeforms")
				.findOne(
					{ userName: ws.userName.toLowerCase() },
					{ _id: 0 },
					(err, result) => {
						if (err) throw err;
						if (result) {
							//if it's an existing user
							if (
								loggedIn.includes(result.userName.toLowerCase() && ws.channel)
							) {
								//if the person's logged in then change their password when they send the command
								bcrypt.hash(ws.passwd, 8, (err, res) => {
									if (err) throw err;
									if (res) {
										dbo
											.collection("lifeforms")
											.updateOne(
												{ userName: result.userName },
												{ $set: { passwd: res } },
												(err, res) => {
													if (err) throw err;
													console.log(
														result.userName + " changed their password"
													);
													ws.send("password changed");
												}
											);
									}
								});
							} else {
								bcrypt.compare(ws.passwd, result.passwd, (err, res) => {
									if (err) throw err;
									if (res) {
										//avoid duplicate logins
										postLogIn(result.defaultChannel);
									} else {
										ws.userName = "";
										ws.channel = "";
										ws.passwd = "";
										ws.send("nah");
									}
								});
							}
						} else {
							//if it's a new user then create account
							bcrypt.hash(ws.passwd, 8, (err, result) => {
								if (err) throw err;
								let messageObj = {
									userName: ws.userName.toLowerCase(),
									passwd: result,
									defaultChannel: defaultChannel
								};
								dbo
									.collection("lifeforms")
									.insertOne(messageObj, function(err, res) {
										if (err) throw err;
										console.log("added " + messageObj.userName);
									});
								postLogIn(messageObj.defaultChannel);
							});
						}
					}
				);
		} else if (
			loggedIn.includes(ws.userName.toLowerCase()) &&
			(splitMessage[0] === "/join" || splitMessage[0] === "/j")
		) {
			if (splitMessage[1].toLowerCase() !== ws.channel) {
				//only do things if it's a different channel
				channels[ws.channel].splice(
					channels[ws.channel].indexOf(ws.userName.toLowerCase()),
					1
				);
				ws.channel = splitMessage[1].toLowerCase();
				console.log(ws.userName + " changed channel to #" + ws.channel);
				ws.send("channel: " + ws.channel);
				if (!channels[ws.channel]) channels[ws.channel] = [];
				channels[ws.channel].push(ws.userName.toLowerCase());
				wss.clients.forEach(client => {
					if (client !== ws && client.channel === ws.channel) {
						console.log("sent list request");
						client.send("list: " + channels[ws.channel].join(" "));
					}
				});
			} else {
				ws.send("same channel");
			}
		} else if (
			loggedIn.includes(ws.userName.toLowerCase()) &&
			message === "logs???"
		) {
			sendLog(ws.channel);
		} else if (
			loggedIn.includes(ws.userName.toLowerCase()) &&
			message === "/default"
		) {
			dbo
				.collection("lifeforms")
				.updateOne(
					{ userName: ws.userName.toLowerCase() },
					{ $set: { defaultChannel: ws.channel } },
					(err, res) => {
						if (err) throw err;
						console.log(
							ws.userName + " changed their default channel to #" + ws.channel
						);
						ws.send("default channel set");
					}
				);
		} else if (
			loggedIn.includes(ws.userName.toLowerCase()) &&
			message === "/list"
		) {
			ws.send("list: " + channels[ws.channel].join(" "));
		} else if (
			loggedIn.includes(ws.userName.toLowerCase()) &&
			message === "/users"
		) {
			ws.send("users: " + channels[ws.channel].join(" "));
		} else if (
			loggedIn.includes(ws.userName.toLowerCase()) &&
			splitMessage[0] === "/w"
		) {
			if (splitMessage[1] !== ws.userName.toLowerCase()) {
				ws.timeStamp = new Date();
				wss.clients.forEach(client => {
					if (client.userName === splitMessage[1]) {
						client.send(
							`[${ws.timeStamp.getTime()}] [w] ${ws.userName}: ${message.substr(
								splitMessage[0].length + splitMessage[1].length + 2
							)}`
						);
						ws.send(
							`[${ws.timeStamp.getTime()}] [w] ${ws.userName}: ${message.substr(
								splitMessage[0].length + splitMessage[1].length + 2
							)}`
						);
					}
				});
			} else {
				ws.send("same whisper");
			}
		} else if (
			loggedIn.includes(ws.userName.toLowerCase()) &&
			splitMessage[0] === "/msg"
		) {
			//message handling
			ws.timeStamp = new Date();
			let messageObj = {
				timeStamp: ws.timeStamp.getTime(),
				channel: ws.channel,
				userName: ws.userName,
				message: message.substr(splitMessage[0].length + 1)
			};
			dbo.collection("messages").insertOne(messageObj, function(err, res) {
				if (err) throw err;
				console.log(
					`#${messageObj.channel} ${
						messageObj.userName
					}: ${messageObj.message.substr(0, 10)} received and inserted into db`
				);
			});
			wss.clients.forEach(client => {
				if (client !== ws && client.channel === ws.channel) {
					client.send(
						`[${ws.timeStamp.getTime()}] ${ws.userName}: ${message.substr(
							splitMessage[0].length + 1
						)}`
					);
				}
			});
		}
	});
	ws.on("close", function close() {
		if (ws.userName) {
			if (ws.channel)
				channels[ws.channel].splice(
					channels[ws.channel].indexOf(ws.userName.toLowerCase()),
					1
				);
			loggedIn.splice(loggedIn.indexOf(ws.userName), 1);
			console.log(ws.userName + " disconnected");
		}
	});
});
