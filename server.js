const ws = require("ws");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

const port = process.env.PORT || 4521;

const wss = new ws.Server({ port });
if (wss) console.log(`listening on port ${port}`);

const mongoURL = "mongodb://localhost:27017/chat";
let dbo;

MongoClient.connect(
	mongoURL,
	{ useNewUrlParser: true, useUnifiedTopology: true },
	function(err, db) {
		if (err) throw err;
		dbo = db.db("chat");
		console.log("mongo working");
	}
);

const deleteInterval = 21600000;
function cleanup() {
	dbo.collection("messages").drop();
	dbo.createCollection("messages", function(err, res) {
		if (err) throw err;
	});
}
setInterval(cleanup, deleteInterval);

const defaultChannel = "general";

const channels = { [defaultChannel]: [] }; // list of people in a given channel
const loggedIn = []; // list of people online

wss.on("connection", conn => {
	conn.on("message", message => {
		const splitMessage = message.split(" ", 2);

		function sendLog(channel) {
			dbo
				.collection("messages")
				.find({ channel: channel }, { _id: 0 })
				.each((err, msg) => {
					if (err) throw err;
					if (msg)
						// TODO: send object
						conn.send(`[${msg.timeStamp}] ${msg.userName}: ${msg.message}`);
				});
		}

		function postLogIn(channel) {
			conn.channel = channel;
			if (channels[channel].includes(conn.userName.toLowerCase())) {
				// no duplicate logins
				conn.userName = "";
				conn.channel = "";
				conn.passwd = "";
				conn.send("nah");
			} else {
				if (!channels[conn.channel]) channels[conn.channel] = [];
				loggedIn.push(conn.userName.toLowerCase());
				channels[conn.channel].push(conn.userName);
				conn.send("channel: " + conn.channel);
				wss.clients.forEach(client => {
					if (client !== conn && client.channel === conn.channel) {
						console.log("sent list request");
						client.send("list: " + channels[conn.channel].join(" "));
					}
				});
				console.log(conn.userName + " logged in");
			}
		}

		// login segment
		if (splitMessage[0] === "/name") {
			// username handling
			if (loggedIn.includes(conn.userName) && conn.channel) {
				// if this is a name change request then do that
				const oldName = conn.userName.toLowerCase();
				conn.userName = splitMessage[1].substr(0, 23);
				dbo
					.collection("lifeforms")
					.findOne(
						{ userName: conn.userName.toLowerCase() },
						{ _id: 0 },
						(err, result) => {
							if (err) throw err;
							if (!result) {
								// if there is no other existing account by that name
								// update the arrays as well
								dbo
									.collection("lifeforms")
									.updateOne(
										{ userName: oldName },
										{ $set: { userName: conn.userName.toLowerCase() } },
										err => {
											if (err) throw err;
											channels[conn.channel].splice(
												channels[conn.channel].indexOf(oldName),
												1
											);
											channels[conn.channel].push(conn.userName.toLowerCase());
											loggedIn.splice(loggedIn.indexOf(oldName), 1);
											loggedIn.push(conn.userName.toLowerCase());
											conn.send("name changed to " + conn.userName);
											conn.send("list: " + channels[conn.channel].join(" "));
											console.log(
												oldName + " changed their name to " + conn.userName
											);
										}
									);
							} else conn.send("same name");
						}
					);
			} else if (!splitMessage[1].match(/[^\S]+/)) {
				[, conn.userName] = splitMessage;
			}
		} else if (conn.userName && splitMessage[0] === "/passwd") {
			// password handling
			[, conn.passwd] = splitMessage;
			dbo
				.collection("lifeforms")
				.findOne(
					{ userName: conn.userName.toLowerCase() },
					{ _id: 0 },
					(err, result) => {
						if (err) throw err;
						if (result) {
							// if it's an existing user
							if (
								loggedIn.includes(result.userName.toLowerCase()) &&
								conn.channel
							) {
								// if the person's logged in then change their password when they send the command
								bcrypt.hash(conn.passwd, 8, (err, res) => {
									if (err) throw err;
									if (res) {
										dbo
											.collection("lifeforms")
											.updateOne(
												{ userName: result.userName.toLowerCase() },
												{ $set: { passwd: res } },
												err => {
													if (err) throw err;
													console.log(
														result.userName + " changed their password"
													);
													conn.send("password changed");
												}
											);
									}
								});
							} else {
								bcrypt.compare(conn.passwd, result.passwd, (err, res) => {
									if (err) throw err;
									if (res) {
										// avoid duplicate logins
										postLogIn(result.defaultChannel);
									} else {
										conn.userName = "";
										conn.channel = "";
										conn.passwd = "";
										conn.send("nah");
									}
								});
							}
						} else {
							// if it's a new user then create account
							bcrypt.hash(conn.passwd, 8, (err, res) => {
								if (err) throw err;
								const messageObj = {
									userName: conn.userName.toLowerCase(),
									passwd: res,
									defaultChannel: defaultChannel
								};
								dbo
									.collection("lifeforms")
									.insertOne(messageObj, function(err) {
										if (err) throw err;
										console.log("added " + messageObj.userName);
									});
								postLogIn(messageObj.defaultChannel);
							});
						}
					}
				);
		} else if (
			loggedIn.includes(conn.userName.toLowerCase()) &&
			(splitMessage[0] === "/join" || splitMessage[0] === "/j")
		) {
			if (splitMessage[1].toLowerCase() !== conn.channel) {
				// only do things if it's a different channel
				channels[conn.channel].splice(
					channels[conn.channel].indexOf(conn.userName.toLowerCase()),
					1
				);
				conn.channel = splitMessage[1].toLowerCase();
				console.log(conn.userName + " changed channel to #" + conn.channel);
				conn.send("channel: " + conn.channel);
				if (!channels[conn.channel]) channels[conn.channel] = [];
				channels[conn.channel].push(conn.userName.toLowerCase());
				wss.clients.forEach(client => {
					if (client !== conn && client.channel === conn.channel) {
						console.log("sent list request");
						client.send("list: " + channels[conn.channel].join(" "));
					}
				});
			} else {
				conn.send("same channel");
			}
		} else if (
			loggedIn.includes(conn.userName.toLowerCase()) &&
			message === "logs???"
		) {
			sendLog(conn.channel);
		} else if (
			loggedIn.includes(conn.userName.toLowerCase()) &&
			message === "/default"
		) {
			dbo
				.collection("lifeforms")
				.updateOne(
					{ userName: conn.userName.toLowerCase() },
					{ $set: { defaultChannel: conn.channel } },
					(err, res) => {
						if (err) throw err;
						console.log(
							conn.userName +
								" changed their default channel to #" +
								conn.channel
						);
						conn.send("default channel set");
					}
				);
		} else if (
			loggedIn.includes(conn.userName.toLowerCase()) &&
			message === "list???"
		) {
			conn.send("list: " + channels[conn.channel].join(" "));
		} else if (
			loggedIn.includes(conn.userName.toLowerCase()) &&
			message === "/users"
		) {
			conn.send("users: " + channels[conn.channel].join(" "));
		} else if (
			loggedIn.includes(conn.userName.toLowerCase()) &&
			splitMessage[0] === "/w"
		) {
			if (splitMessage[1] !== conn.userName.toLowerCase()) {
				conn.timeStamp = new Date();
				wss.clients.forEach(client => {
					if (client.userName === splitMessage[1]) {
						client.send(
							`[${conn.timeStamp.getTime()}] [w] ${
								conn.userName
							}: ${message.substr(
								splitMessage[0].length + splitMessage[1].length + 2
							)}`
						);
						conn.send(
							`[${conn.timeStamp.getTime()}] [w] ${
								conn.userName
							}: ${message.substr(
								splitMessage[0].length + splitMessage[1].length + 2
							)}`
						);
					}
				});
			} else {
				conn.send("same whisper");
			}
		} else if (
			loggedIn.includes(conn.userName.toLowerCase()) &&
			splitMessage[0] === "/msg"
		) {
			// message handling
			conn.timeStamp = new Date();
			const messageObj = {
				timeStamp: conn.timeStamp.getTime(),
				channel: conn.channel,
				userName: conn.userName,
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
				if (client.channel === conn.channel) {
					// TODO: send object
					client.send(
						`[${conn.timeStamp.getTime()}] ${conn.userName}: ${message.substr(
							splitMessage[0].length + 1
						)}`
					);
				}
			});
		}
	});

	conn.on("close", function close() {
		if (conn.userName) {
			if (conn.channel) {
				channels[conn.channel].splice(
					channels[conn.channel].indexOf(conn.userName.toLowerCase()),
					1
				);
				wss.clients.forEach(client => {
					if (client.channel === conn.channel)
						client.send("list: " + channels[conn.channel].join(" "));
				});
				loggedIn.splice(loggedIn.indexOf(conn.userName), 1);
				console.log(conn.userName + " disconnected");
			}
		}
	});
});
