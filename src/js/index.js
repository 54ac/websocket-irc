import "normalize.css";
import "../css/index.css";

class Terminal {
	constructor(selector) {
		this.element = document.querySelector(selector);
	}

	print(msg) {
		if (
			this.element.lastChild &&
			this.element.lastChild.textContent === msg &&
			!msg.startsWith("[")
		)
			return;

		const newMsg = document.createElement("p");
		newMsg.textContent = msg;
		this.element.appendChild(newMsg);
		this.element.scrollTop = this.element.scrollHeight;
	}

	clear() {
		this.element.textContent = "";
	}

	url() {
		const newMsg = document.createElement("p");
		newMsg.textContent = "this is a demo of ";

		const newUrl = document.createElement("a");
		newUrl.rel = "noreferrer noopener";
		newUrl.target = "_blank";
		newUrl.href = "https://github.com/rowrawer/websocket-irc";
		newUrl.textContent = "https://github.com/rowrawer/websocket-irc";

		newMsg.appendChild(newUrl);
		this.element.appendChild(newMsg);
		this.element.scrollTop = this.element.scrollHeight;
	}
}

const WebSocket = window.WebSocket || window.MozWebSocket;
const chat = new Terminal("#chat");
const userlist = new Terminal("#userlist");
const input = document.querySelector("input");
const userNameInput = document.querySelector("label");
let username;
let currentChannel;
let chatSocket;
let refreshInterval;

const sendRequest = (request, message = {}) =>
	chatSocket.send(JSON.stringify({ request, ...message }));

const login = (err, pass) => {
	clearInterval(refreshInterval);
	userlist.clear();
	input.focus();

	if (!pass) {
		chat.clear();
		if (err) chat.print("// no spaces allowed!!!");

		chat.print("name???");
		input.onkeyup = e => {
			if (e.key !== "Enter" || input.value.length === 0) return;
			username = input.value.substring(0, 24);
			if (username.match(/[^\S]+/)) {
				chat.clear();
				input.value = "";
				login(true, false);
			} else login(false, true);
		};
	} else {
		input.value = "";
		input.type = "password";
		chat.print("---");
		chat.print("password???");
		input.onkeyup = e => {
			if (e.key !== "Enter" || input.value.length === 0) return;
			chatSocket.onmessage = message => {
				const messageObj = JSON.parse(message.data);
				if (!messageObj || messageObj.login === false) {
					chat.clear();
					login();
				} else {
					// username in front of input
					userNameInput.textContent = `${username}:\xa0`;

					chat.clear();
					document.querySelector("#input").style.borderTop = "0.125em dashed";
					document.querySelector("#userlist").style.borderLeft =
						"0.125em dashed";
					welcome(messageObj.channel);
				}
			};
			sendRequest("login", { username, passwd: input.value });
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
	chat.url();
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
		sendRequest("users");
	sendRequest("logs");
	sendRequest("list");
};

const listen = message => {
	console.log(message.data);
	const messageObj = JSON.parse(message.data);

	switch (messageObj.response) {
		case "message":
			if (messageObj.message === false) {
				chat.print("---");
				chat.print("// couldn't send message");
				chat.print("---");
			} else {
				const timestampNow = new Date();
				const timestampMsg = new Date(messageObj.timestamp);
				let output = "";

				if (timestampMsg.getDate() !== timestampNow.getDate()) {
					// compares timestamp to now to figure out whether to add day and month
					output = `(${("0" + (timestampMsg.getDate() + 1)).slice(-2)}.${(
						"0" +
						(timestampMsg.getMonth() + 1)
					).slice(-2)}) [${("0" + timestampMsg.getHours()).slice(-2)}:${(
						"0" + timestampMsg.getMinutes()
					).slice(-2)}]`;
				} else {
					output = `[${("0" + timestampMsg.getHours()).slice(-2)}:${(
						"0" + timestampMsg.getMinutes()
					).slice(-2)}]`;
				}

				if (messageObj.to) output += ` [w] `;

				output += ` ${messageObj.username}: ${messageObj.message}`;
				chat.print(output);

				if (!document.hasFocus())
					document.title = "[!] the websocket irc mimic";
			}
			break;
		case "channel":
			if (messageObj.channel === false) {
				chat.print("---");
				chat.print("// couldn't join channel");
				chat.print("---");
			} else {
				chat.clear();
				joining(messageObj.channel);
			}
			break;
		case "nameChange":
			if (messageObj.username === false) {
				chat.print("---");
				chat.print("// choose a different name");
				chat.print("---");
			} else {
				username = messageObj.username;
				chat.print("---");
				chat.print("// name changed to " + username);
				chat.print("---");
				userNameInput.textContent = `${username}:\xa0`;
			}
			break;
		case "passwdChange":
			if (messageObj.passwd === false) {
				chat.print("---");
				chat.print("// couldn't change password");
				chat.print("---");
				break;
			} else {
				chat.print("---");
				chat.print("// password changed");
				chat.print("---");
			}
			break;
		case "defaultChannel":
			if (messageObj.defaultChannel === false) {
				chat.print("---");
				chat.print("// couldn't change default channel");
				chat.print("---");
			} else {
				chat.print("---");
				chat.print("// changed default channel to #" + currentChannel);
				chat.print("---");
			}
			break;
		case "list":
			if (messageObj.list === false) {
				chat.print("---");
				chat.print("// couldn't get user list");
				chat.print("---");
			} else {
				userlist.clear();
				messageObj.list.forEach(e => userlist.print(e));
				if (!document.hasFocus())
					document.title = "[!] the websocket irc mimic";
			}
			break;
		case "users":
			if (messageObj.users === false) {
				chat.print("---");
				chat.print("// couldn't get user list");
				chat.print("---");
			} else {
				chat.print("---");
				chat.print("// users present:");
				messageObj.users.forEach(e => chat.print(e));
				chat.print("---");
			}
			break;
		default:
			chat.print("---");
			chat.print("// can't understand server");
			chat.print("---");
	}
};

const sendMsg = () => {
	if (!input.value.startsWith("/"))
		sendRequest("message", {
			message: input.value.substring(0, 140)
		});
	else {
		const command = input.value.substring(1).split(" ");
		switch (command[0]) {
			case "name":
				if (!command[1]) {
					chat.print("---");
					chat.print("// incorrect command");
					chat.print("---");
				} else
					sendRequest("nameChange", { username: command[1].substring(0, 24) });
				break;
			case "passwd":
				if (!command[1]) {
					chat.print("---");
					chat.print("// incorrect command");
					chat.print("---");
				} else sendRequest("passwdChange", { passwd: command[1] });
				break;
			case "j":
			case "join":
				if (!command[1]) {
					chat.print("---");
					chat.print("// incorrect command");
					chat.print("---");
				} else sendRequest("join", { channel: command[1] });
				break;
			case "logs":
				sendRequest("logs");
				break;
			case "default":
				sendRequest("defaultChannel");
				break;
			case "users":
				sendRequest("users");
				break;
			case "w":
			case "whisper":
				if (command.length < 3) {
					chat.print("---");
					chat.print("// couldn't send message");
					chat.print("---");
				} else
					sendRequest("whisper", {
						to: command[1],
						message: command[2].substring(0, 140)
					});

				break;
			case "night":
				document.body.classList.contains("night")
					? document.body.classList.remove("night")
					: document.body.classList.add("night");
				break;
			case "help":
				help();
				break;
			default:
				chat.print("---");
				chat.print("// incorrect command");
				chat.print("---");
		}
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
	refreshInterval = setInterval(() => {
		document.location = window.location.href;
	}, 5000);
};

window.onload = () => {
	document.querySelector("#content").style.maxHeight =
		(document.documentElement.clientHeight || window.innerHeight) + "px";

	chatSocket =
		process.env.NODE_ENV === "development"
			? new WebSocket(`ws://${window.location.hostname}:4521`)
			: new WebSocket(`wss://${window.location.host}/ws/`);

	chatSocket.onopen = () => {
		login();

		chatSocket.onclose = () => {
			console.error("closed ws");
			disconnected();
		};
	};
};

window.onresize = () =>
	(document.querySelector("#content").style.maxHeight =
		(document.documentElement.clientHeight || window.innerHeight) + "px");

document.onfocus = () => (document.title = "the websocket irc mimic");
