import "./main.css";

class Terminal {
	constructor(selector) {
		this.element = document.querySelector(selector);
	}

	print(msg) {
		if (this.element.lastChild && this.element.lastChild.textContent === msg)
			return;
		const newMsg = document.createElement("p");
		newMsg.textContent = msg;
		this.element.appendChild(newMsg);
		this.element.scrollTop = this.element.scrollHeight;
	}

	clear() {
		this.element.textContent = "";
	}
}

const WebSocket = window.WebSocket || window.MozWebSocket;
const chat = new Terminal("#chat");
const userlist = new Terminal("#userlist");
const input = document.querySelector("input");
const userNameInput = document.querySelector("label");
let username;
let currentChannel;
const chatSocket = process.env.dev
	? new WebSocket(`ws://${window.location.hostname}:4521`)
	: new WebSocket(`wss://${window.location.host}/ws/`);

const login = (err, pass) => {
	clearInterval();
	userlist.clear();
	input.focus();

	if (!pass) {
		chat.clear();
		if (err) chat.print("// no spaces allowed!!!");
		chat.print("name???");
		input.onkeyup = e => {
			if (e.key !== "Enter" || input.value.length === 0) return;
			username = input.value.substr(0, 23);
			if (username.match(/[^\S]+/)) {
				chat.clear();
				input.value = "";
				login(true, false);
			} else {
				chatSocket.send("/name " + username);
				login(false, true);
			}
		};
	} else {
		input.value = "";
		input.type = "password";
		chat.print("---");
		chat.print("password???");
		input.onkeyup = e => {
			if (e.key !== "Enter" || input.value.length === 0) return;
			chatSocket.onmessage = event => {
				if (event.data.startsWith("channel: ")) {
					// username in front of input
					userNameInput.textContent = `${username}:\xa0`;
					const channelName = event.data.substr(9);
					chat.clear();
					document.querySelector("#input").style.borderTop = "0.125em dashed";
					document.querySelector("#userlist").style.borderLeft =
						"0.125em dashed";
					welcome(channelName);
				} else {
					chat.clear();
					login();
				}
			};
			chatSocket.send("/passwd " + input.value);
			input.value = "";
			input.type = "text";
		};
	}
};

const help = () => {
	chat.print("---");
	chat.print("commands:");
	chat.print("/name to change your name (e.g. /name rowrawer)");
	chat.print("/passwd to change your password (e.g. /passwd hunter2)");
	chat.print("/join or /j to join a different channel (e.g. /j general)");
	chat.print("/w to whisper to someone (e.g. /w rowrawer)");
	chat.print("/users to list the users present in the current channel");
	chat.print(
		"/default to automatically join the current channel after logging in"
	);
	chat.print("/night to switch between day and night mode");
	// utterly useless night mode flourish
	document.querySelector("#chat").lastChild.style.display = "inline-block";
	document.querySelector("#chat").lastChild.classList.add("night");
	chat.print("/help to show these commands again");
};

const welcome = channelName => {
	chat.print("welcome to the websocket irc mimic");
	chat.print("---");
	chat.print("this is a demo of https://github.com/rowrawer/websocket-irc");
	chat.print("i am not responsible for anything anyone says on here");
	help();

	joining(channelName);
	chatSocket.onmessage = e => listen(e);
	input.onkeyup = e => {
		if (e.key === "Enter" && input.value.length !== 0) sendMsg();
	};
};

const joining = channelName => {
	chat.print("---");
	chat.print("// now joining #" + channelName);
	currentChannel = channelName;
	chat.print("---");
	if (window.matchMedia("(orientation: portrait)").matches)
		chatSocket.send("/users");
	chatSocket.send("logs???");
	chatSocket.send("list???");
};

const listen = event => {
	if (event.data.startsWith("[")) {
		// TODO: receive object & interpret
		const timeStampRegex = /\[(\d+)\]/;
		const timeStamp = new Date();
		let timeStampRegexOutput = event.data.match(timeStampRegex)[0]; // this whole segment extracts the timestamp from the server message and parses it
		timeStampRegexOutput = timeStampRegexOutput.substr(
			1,
			timeStampRegexOutput.length - 2
		);
		timeStamp.setTime(timeStampRegexOutput);
		const timeStampNow = new Date();
		let timeStampOutput;
		if (timeStamp.getDate() !== timeStampNow.getDate()) {
			// compares timestamp to now to figure out whether to add day and month
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
		chat.print(event.data.replace(timeStampRegex, timeStampOutput));
		if (!document.hasFocus()) document.title = "[!] the websocket irc mimic";
	} else if (event.data.startsWith("channel: ")) {
		chat.clear();
		joining(event.data.substr(9));
	} else if (event.data === "same channel") {
		chat.print("---");
		chat.print("// you are already here");
		chat.print("---");
	} else if (event.data.startsWith("name changed to ")) {
		username = event.data.substr(16);
		chat.print("---");
		chat.print("// name changed to " + username);
		chat.print("---");
		userNameInput.textContent = `${username}:\xa0`;
	} else if (event.data === "same name") {
		chat.print("---");
		chat.print("// choose a different name");
		chat.print("---");
	} else if (event.data === "password changed") {
		chat.print("---");
		chat.print("// password changed");
		chat.print("---");
	} else if (event.data === "default channel set") {
		chat.print("---");
		chat.print("// changed default channel to #" + currentChannel);
		chat.print("---");
	} else if (event.data === "same whisper") {
		chat.print("---");
		chat.print("// no need to whisper to yourself");
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
	} else if (event.data.startsWith("users: ")) {
		chat.print("---");
		chat.print("// users present:");
		event.data
			.substr(7)
			.split(" ")
			.forEach(element => {
				chat.print(element);
			});
		chat.print("---");
	}
};

const sendMsg = () => {
	if (input.value === "/night") {
		document.getElementById("content").classList.contains("night")
			? document.getElementById("content").classList.remove("night")
			: document.getElementById("content").classList.add("night");
	} else if (input.value === "/help") help();
	else if (input.value.startsWith("/")) {
		chatSocket.send(input.value.substr(0, 139));
	} else {
		chatSocket.send("/msg " + input.value.substr(0, 139));
	}
	input.value = "";
};

const disconnected = () => {
	chat.print("---");
	chat.print("// disconnected from server");
	chat.print("// reconnecting");
	chat.print("---");
	username = "";
	userNameInput.textContent = "";
	setInterval(() => {
		document.location = window.location.href;
	}, 5000);
};

window.onload = () => {
	document.querySelector("#content").style.maxHeight =
		(document.documentElement.clientHeight || window.innerHeight) + "px";

	chatSocket.onopen = login();

	chatSocket.onclose = () => {
		chatSocket.close();
		console.log("closed ws");
		disconnected();
	};

	window.onresize = () =>
		(document.querySelector("#content").style.maxHeight =
			(document.documentElement.clientHeight || window.innerHeight) + "px");

	document.onfocus = () => (document.title = "the websocket irc mimic");
};
