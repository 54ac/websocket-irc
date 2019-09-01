const webSocket = window.WebSocket || window.MozWebSocket;
const chat = new Terminal();
const userlist = new Terminal();
var username;
var currentChannel;
var chatSocket = new webSocket(`ws://${location.host}`);

chat.setBackgroundColor("white");
chat.setTextColor("black");
chat.setWidth("100%");
chat.setHeight("100vh");

userlist.setBackgroundColor("white");
userlist.setTextColor("black");
userlist.setWidth("100%");
userlist.setHeight("100vh");

function getTimeStamp() {
	let timeStamp = new Date();
	timeStamp = `${("0" + timeStamp.getHours()).substr(-2)}:${(
		"0" + timeStamp.getMinutes()
	).substr(-2)}`;
	return timeStamp;
}

function login(no) {
	clearInterval();
	userlist.clear();
	if (no) chat.print("// no spaces allowed!!!");
	chat.input("name???", output => {
		username = output.substr(0, 23);
		if (username.match(/[^\S]+/)) {
			chat.clear();
			login(true);
		} else {
			chatSocket.send("/name " + username);
			chat.print("---");
			chat.password("password???", output => {
				chatSocket.onmessage = event => {
					if (event.data.startsWith("channel: ")) {
						//terminal.js hack to display username in chat
						let userNameInput = document.createElement("span");
						userNameInput.id = "username";
						userNameInput.innerHTML = `${username}: `;
						let currentLine = document
							.getElementsByClassName("Terminal")[0]
							.getElementsByTagName("div")[0]
							.getElementsByTagName("p")[1];
						currentLine.insertBefore(
							userNameInput,
							currentLine.getElementsByTagName("span")[0]
						);
						let channelName = event.data.substr(9);
						chat.clear();
						welcome(channelName);
					} else {
						chat.clear();
						login();
					}
				};
				chatSocket.send("/passwd " + output);
			});
		}
	});
}

function welcome(channelName) {
	chat.print("welcome to the websocket irc mimic");
	chat.print("---");
	chat.print("commands:");
	chat.print("/name to change name (e.g. /name rowrawer)");
	chat.print("/passwd to change password (e.g. /passwd hunter2)");
	chat.print("/join or /j to join a different channel (e.g. /j general)");
	chat.print("/w to whisper to someone (e.g. /w rowrawer)");
	chat.print(
		"/default to automatically join the current channel after logging in"
	);
	chat.print("/night to switch between day and night mode");

	//utterly useless night mode flourish
	for (let e of document.getElementById("chat").getElementsByTagName("div")) {
		if (e.textContent === "/night to switch between day and night mode") {
			e.style.display = "inline-block";
			e.classList.add("night");
		}
	}

	joining(channelName);
	loggedIn();
}

function joining(channelName) {
	chat.print("---");
	chat.print("// now joining #" + channelName);
	currentChannel = channelName;
	chat.print("---");
	chatSocket.send("logs???");
	chatSocket.send("/list");
}

function loggedIn() {
	chatSocket.onmessage = event => {
		if (event.data.startsWith("[")) {
			let newMsg = document.createElement("div"); //terminal.js hack to display received messages
			const timeStampRegex = /\[(\d+)\]/;
			let timeStamp = new Date();
			let timeStampRegexOutput = event.data.match(timeStampRegex)[0]; //this whole segment extracts the timestamp from the server message and parses it
			timeStampRegexOutput = timeStampRegexOutput.substr(
				1,
				timeStampRegexOutput.length - 2
			);
			timeStamp.setTime(timeStampRegexOutput);
			let timeStampNow = new Date();
			let timeStampOutput;
			if (timeStamp.getDate() !== timeStampNow.getDate()) {
				//compares timestamp to now to figure out whether to add day and month
				timeStampOutput = `(${("0" + (timeStamp.getDate() + 1)).substr(-2)}.${(
					"0" +
					(timeStamp.getMonth() + 1)
				).substr(-2)}) [${("0" + timeStamp.getHours()).substr(-2)}:${(
					"0" + timeStamp.getMinutes()
				).substr(-2)}]`;
			} else {
				timeStampOutput = `[${("0" + timeStamp.getHours()).substr(-2)}:${(
					"0" + timeStamp.getMinutes()
				).substr(-2)}]`;
			}
			newMsg.innerHTML = event.data.replace(timeStampRegex, timeStampOutput);
			document
				.getElementsByClassName("Terminal")[0]
				.getElementsByTagName("div")[0]
				.getElementsByTagName("p")[0]
				.appendChild(newMsg);
			if (!document.hasFocus()) document.title = "[!] the websocket irc mimic";
		} else if (event.data.startsWith("channel: ")) {
			joining(event.data.substr(9));
		} else if (event.data === "same channel") {
			chat.print("---");
			chat.print("// you are already here");
			chat.print("---");
		} else if (event.data.startsWith("name changed to ")) {
			chat.print("---");
			chat.print("// name changed to " + event.data.substr(16));
			chat.print("---");
			document.getElementById("username").innerHTML = document
				.getElementById("username")
				.innerHTML.replace(username, event.data.substr(16));
			username = event.data.substr(16);
		} else if (event.data === "same name") {
			chat.print("---");
			chat.print("// name already taken");
			chat.print("---");
		} else if (event.data === "password changed") {
			chat.print("---");
			chat.print("// password changed");
			chat.print("---");
		} else if (event.data === "default channel set") {
			chat.print("---");
			chat.print("// changed default channel to #" + currentChannel);
			chat.print("---");
		} else if (event.data.startsWith("list: ")) {
			userlist.clear();
			event.data
				.substr(6)
				.split(" ")
				.forEach(element => {
					userlist.print(element);
				});
			if (!document.hasFocus()) document.title = "[!] the websocket irc mimic";
		}
	};

	chat.input("", output => {
		let lastLine = document
			.getElementsByClassName("Terminal")[0]
			.getElementsByTagName("div")[0]
			.getElementsByTagName("p")[0].lastChild; //terminal.js hack to output sent message

		if (lastLine.innerHTML && !lastLine.innerHTML.startsWith("/")) {
			chatSocket.send("/msg " + output.substr(0, 139));

			lastLine.innerHTML = `[${getTimeStamp()}] ${username}: ${lastLine.innerHTML.substr(
				0,
				139
			)}`;
		} else {
			if (lastLine.innerHTML && lastLine.innerHTML !== "/night") {
				chatSocket.send(output.substr(0, 139));
			} else if (lastLine.innerHTML === "/night") {
				document.getElementById("content").classList.contains("night")
					? document.getElementById("content").classList.remove("night")
					: document.getElementById("content").classList.add("night");
			}

			lastLine.innerHTML = "";
		}

		loggedIn();
	});
}

function disconnected() {
	chat.print("---");
	chat.print("// disconnected from server");
	chat.print("// reconnecting");
	chat.print("---");
	if (document.getElementById("username"))
		document.getElementById("username").parentElement.innerHTML = "";
	setInterval(() => {
		document.location = location.href;
	}, 5000);
}

window.onload = () => {
	document.getElementById("chat").appendChild(chat.html);
	document.getElementById("userList").appendChild(userlist.html);

	chatSocket.onopen = login();

	chatSocket.onclose = () => {
		chatSocket.close();
		console.log("closed ws");
		disconnected();
	};

	document.addEventListener("focusin", () => {
		document.title = "the websocket irc mimic";
	});
};
