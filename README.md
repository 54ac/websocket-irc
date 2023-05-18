## The WebSocket IRC Mimic

### What is this?

This is a project I did some time ago which aims to emulate an [IRC](https://en.wikipedia.org/wiki/Internet_Relay_Chat)-like experience in the browser by using WebSockets. Features channels, accounts, and even night mode. Consists of a pure Javascript frontend, a Node server, and a MongoDB database.

### What is this written in?

- Javascript,
- Node.js.

### What are some of the main features?

- Frontend (website):
  - Uses the [IBM VGA 8x16](https://int10h.org/oldschool-pc-fonts/fontlist/font?ibm_vga_8x16) font for nostalgia purposes,
  - Uses the WebSocket API for live communication with the server (and therefore other people).
- Backend (server):
  - Uses WebSockets to communicate with the client,
  - Uses a MongoDB database to store accounts and messages,
  - Uses bcrypt for password handling.

### What's the point?

Familiarizing myself with the WebSocket API and ~~Webpack~~ ~~Rollup~~ Parcel. Also, it's really cool to be able to create something that resembles IRC (if only slightly) in so few lines of code.

### How do I use this?

1. Provide username and password,
2. Talk to other people.

### Where can I use this?

**[Check out this demo right here.](https://54ac.bio:5421/)**

### How do I launch this myself?

1. `git clone https://github.com/54ac/websocket-irc.git .`
2. `npm i`
3. `npm start`
