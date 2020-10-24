const HtmlWebPackPlugin = require("html-webpack-plugin");
const { DefinePlugin } = require("webpack");
const path = require("path");

module.exports = {
	mode: "development",
	devtool: "inline-source-map",
	devServer: {
		contentBase: path.join(__dirname, "dist"),
		compress: true,
		host: "192.168.0.25",
		disableHostCheck: true,
		port: 5421
	},
	module: {
		rules: [
			{
				test: /\.js$/,
				exclude: /node_modules/,
				use: {
					loader: "babel-loader"
				}
			},
			{
				test: /\.html$/,
				use: [
					{
						loader: "html-loader"
					}
				]
			},
			{
				test: /\.css$/,
				use: ["style-loader", "css-loader"]
			}
		]
	},
	plugins: [
		new HtmlWebPackPlugin({
			template: "./src/index.html",
			filename: "./index.html"
		}),
		new DefinePlugin({
			"process.env.dev": JSON.stringify(true)
		})
	]
};
