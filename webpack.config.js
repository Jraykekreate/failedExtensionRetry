const path = require("path");
const CopyWebpackPlugin = require('copy-webpack-plugin')
module.exports = {
    entry: {
        popup: "./src/popup.js",
        serviceWorker: "./src/serviceWorker.js",
        contentScript: "./src/contentScript.js"
    },
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, "dist")
    },
    devtool: 'cheap-module-source-map',
    mode: "development",
    watch: true,
    plugins: [
        new CopyWebpackPlugin({
            patterns: [{ from: 'static' }]
        })
    ]

}