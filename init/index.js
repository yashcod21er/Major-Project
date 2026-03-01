const mongoose=require("mongoose");
const initdata = require("./data.js")
const Listing= require("../models/listing.js")
main()
    .then((res) => {
    console.log('Connected to MongoDB')
    })
    .catch((err) => {console.log(err)});


    async function main() {
        await mongoose.connect('mongodb://127.0.0.1:27017/UrbanStay');
    }

    const initDB = async ()=>{
        await  Listing.deleteMany({});
        initdata.data = initdata.data.map((obj) => ({...obj, owner:"699a77239d6e87c06f8e752c"}))
        await Listing.insertMany(initdata.data);
        console.log("data was initilized")
    }

    initDB();