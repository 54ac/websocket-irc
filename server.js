const ws = require("ws");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcrypt");

const port = process.env.PORT || 4521;

const wss = new ws.Server({ port });
if (wss) console.log(`listening on port ${port}`);

const mongoURL = "mongodb://localhost:27017/chat";
let dbo;

MongoClient.connect(
	mongoURL,
	{ useNewUrlParser: true, useUnifiedTopology: true },
	(err, db) => {
		if (err) throw err;
		dbo = db.db("chat");
		console.log("mongo working");
	}
);

const deleteInterval = 21600000;
const cleanup = () => {
	dbo.collection("messages").drop();
	dbo.collection("lifeforms").drop();
};
setInterval(cleanup, deleteInterval);

const defaultChannel = "general";

const channels = { [defaultChannel]: [] }; // list of people in a given channel
const loggedIn = []; // list of people online

const sendResponse = (conn, response) => {
	conn.send(JSON.stringify(response));
};
const postLogIn = (conn, channel) => {
	conn.channel = channel;
	if (!channels[conn.channel]) channels[conn.channel] = [];
	if (channels[channel].includes(conn.username)) return;
	loggedIn.push(conn.username);
	channels[conn.channel].push(conn.username);
	sendResponse(conn, { response: "channel", channel: conn.channel });
	wss.clients.forEach((client) => {
		if (client !== conn && client.channel === conn.channel) {
			sendList(client, channels[conn.channel]);
		}
	});
	console.log(conn.username + " logged in");
};

const sendList = (client, channel, users) => {
	// users command is for listing users in chat panel
	if (!users) sendResponse(client, { response: "list", list: channel });
	else sendResponse(client, { response: "users", users: channel });
};

const sendMsg = (conn, messageObj) => {
	conn.timestamp = new Date();
	const message = {
		response: "message",
		timestamp: conn.timestamp.getTime(),
		username: conn.username,
		message: messageObj.message.substring(0, 140),
		_id: null
	};
	if (!messageObj.to) message.channel = conn.channel;
	else message.to = messageObj.to;

	dbo.collection("messages").insertOne(message, (err) => {
		if (err) throw err;
		console.log(
			`${message.username}: ${message.message.substring(
				0,
				10
			)} received and inserted into db`
		);
	});
	wss.clients.forEach((client) => {
		if (!message.to && client.channel === message.channel)
			sendResponse(client, message);
		else if (
			client.username === message.to ||
			client.username === message.username
		)
			sendResponse(client, message);
	});
};

wss.on("connection", (conn) => {
	conn.on("message", (message) => {
		const messageObj = JSON.parse(message);
		if (!messageObj) return;

		switch (messageObj.request) {
			case "login":
				dbo
					.collection("lifeforms")
					.findOne(
						{ username: messageObj.username.toLowerCase() },
						{ _id: 0 },
						(err, result) => {
							if (err) throw err;
							if (result) {
								// login
								bcrypt.compare(messageObj.passwd, result.passwd, (err, res) => {
									if (err) throw err;
									if (!res)
										sendResponse(conn, { response: "login", login: false });
									else {
										conn.username = result.username;
										conn.passwd = result.passwd;
										conn.defaultChannel = result.defaultChannel;
										postLogIn(conn, conn.defaultChannel);
									}
								});
							} else {
								// register
								bcrypt.hash(messageObj.passwd, 8, (err, res) => {
									if (err) throw err;
									if (!res)
										sendResponse(conn, { response: "login", login: false });
									else {
										conn.username = messageObj.username
											.toLowerCase()
											.substring(0, 24);
										conn.passwd = res;
										conn.defaultChannel = defaultChannel;

										dbo.collection("lifeforms").insertOne(
											{
												username: conn.username,
												passwd: conn.passwd,
												defaultChannel: conn.defaultChannel
											},
											(err) => {
												if (err) throw err;
												console.log("added " + conn.username);
												postLogIn(conn, conn.defaultChannel);
											}
										);
									}
								});
							}
						}
					);
				break;
			case "nameChange":
				if (messageObj.username.trim().match(/[^\S]+/))
					sendResponse(conn, { response: "nameChange", username: false });
				else {
					dbo
						.collection("lifeforms")
						.findOne(
							{ username: messageObj.username.trim().toLowerCase() },
							{ _id: 0 },
							(err, result) => {
								if (err) throw err;
								if (!result) {
									// if there is no other existing account by that name
									// update the arrays as well
									dbo.collection("lifeforms").updateOne(
										{ username: conn.username },
										{
											$set: {
												username: messageObj.username.trim().toLowerCase()
											}
										},
										(err) => {
											if (err) throw err;
											channels[conn.channel].splice(
												channels[conn.channel].indexOf(conn.username),
												1
											);
											loggedIn.splice(loggedIn.indexOf(conn.username), 1);

											console.log(
												conn.username +
													" changed their name to " +
													messageObj.username.trim().toLowerCase()
											);
											conn.username = messageObj.username.trim().toLowerCase();

											channels[conn.channel].push(conn.username);
											loggedIn.push(conn.username);

											sendResponse(conn, {
												response: "nameChange",
												username: conn.username
											});

											sendList(conn, channels[conn.channel]);
										}
									);
								} else
									sendResponse(conn, {
										response: "nameChange",
										username: false
									});
							}
						);
				}
				break;
			case "passwdChange":
				dbo
					.collection("lifeforms")
					.findOne({ username: conn.username }, { _id: 0 }, (err, result) => {
						if (err) throw err;
						if (!result || !loggedIn.includes(result.username))
							sendResponse(conn, { response: "passwdChange", passwd: false });
						// if it's an existing user
						else {
							// if the person's logged in then change their password when they send the command
							bcrypt.hash(messageObj.passwd, 8, (err, res) => {
								if (err) throw err;
								if (res) {
									dbo
										.collection("lifeforms")
										.updateOne(
											{ username: result.username },
											{ $set: { passwd: res } },
											(err) => {
												if (err) throw err;
												conn.passwd = res;
												console.log(
													result.username + " changed their password"
												);
												sendResponse(conn, {
													response: "passwdChange",
													passwd: true
												});
											}
										);
								} else
									sendResponse(conn, {
										response: "passwdChange",
										passwd: false
									});
							});
						}
					});
				break;
			case "join":
				if (
					!loggedIn.includes(conn.username) ||
					messageObj.channel === conn.channel
				)
					sendResponse(conn, { response: "join", join: false });
				else {
					channels[conn.channel].splice(
						channels[conn.channel].indexOf(conn.username),
						1
					);
					conn.channel = messageObj.channel.toLowerCase();
					sendResponse(conn, { response: "channel", channel: conn.channel });

					if (!channels[conn.channel]) channels[conn.channel] = [];
					channels[conn.channel].push(conn.username);

					wss.clients.forEach((client) => {
						if (client !== conn && client.channel === conn.channel)
							sendList(client, channels[conn.channel]);
					});

					console.log(conn.username + " changed channel to #" + conn.channel);
				}
				break;
			case "logs":
				if (!loggedIn.includes(conn.username))
					sendResponse(conn, { response: "logs", logs: false });
				else {
					dbo
						.collection("messages")
						.find({ channel: conn.channel }, { _id: 0, message: { $slice: 3 } })
						.forEach((msg) =>
							sendResponse(conn, {
								response: "message",
								timestamp: msg.timestamp,
								username: msg.username,
								message: msg.message,
								_id: null
							})
						);
				}
				break;
			case "defaultChannel":
				if (!loggedIn.includes(conn.username))
					sendResponse(conn, {
						response: "defaultChannel",
						defaultChannel: false
					});
				else {
					dbo
						.collection("lifeforms")
						.updateOne(
							{ username: conn.username },
							{ $set: { defaultChannel: conn.channel } },
							() => {
								console.log(
									conn.username +
										" changed their default channel to #" +
										conn.channel
								);
								sendResponse(conn, {
									response: "defaultChannel",
									defaultChannel: true
								});
							}
						);
				}
				break;
			case "list":
				if (!loggedIn.includes(conn.username))
					sendResponse(conn, { response: "list", list: false });
				else sendList(conn, channels[conn.channel]);
				break;
			case "users":
				if (!loggedIn.includes(conn.username))
					sendResponse(conn, { response: "users", users: false });
				else sendList(conn, channels[conn.channel], true);
				break;
			case "whisper":
				if (
					!loggedIn.includes(conn.username) ||
					!messageObj.to ||
					!messageObj.message ||
					conn.username === messageObj.to
				)
					sendResponse(conn, { response: "message", message: false });
				else sendMsg(conn, messageObj);
				break;
			case "message":
				if (!loggedIn.includes(conn.username) || !messageObj.message)
					sendResponse(conn, { response: "message", message: false });
				else sendMsg(conn, messageObj);
				break;
			default:
				console.log("incorrect message received: " + message);
		}
	});

	conn.on("close", () => {
		if (!conn.username || !conn.channel) return;
		channels[conn.channel].splice(
			channels[conn.channel].indexOf(conn.username.toLowerCase()),
			1
		);
		wss.clients.forEach((client) => {
			if (client.channel === conn.channel)
				sendList(client, channels[conn.channel]);
		});
		loggedIn.splice(loggedIn.indexOf(conn.username), 1);
		console.log(conn.username + " disconnected");
	});
});
