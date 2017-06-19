import * as path from "path";
import * as express from "express";
import * as hbs from 'express-hbs';
import * as bodyParser from "body-parser";
import * as cookieParser from "cookie-parser";
import * as jdenticon from "jdenticon";
import "reflect-metadata";
import * as bcrypt from "bcrypt";
import * as jsHash from "jshashes";
/*one-shot install*/
import {installSite} from "./install";

import * as fileUpload from "express-fileupload";


import { injector } from "./routes/main.injector";
import { postCoverPhoto } from "./routes/cover-photo.post";
import { collectionsRoute, photosRoute } from "./routes/editor.get";

//Database
import {database} from "./database";
import {User} from "./entities/user.entity";


const webpackGlobal = require("../webpack.config");
const main = express();
const editor = express();

console.log("Server started")

main.use("/editor", editor);
main.use(bodyParser.urlencoded({ extended: false }))
main.use(fileUpload());
main.use(cookieParser())

//DI
const webpackOutputDir = webpackGlobal.output.path;
const webpackOutputFilename = webpackGlobal.output.filename;
const webpackOutputUrl = "/bundle";


main.use(webpackOutputUrl, express.static( webpackOutputDir ))
main.use("/media", express.static( path.join(__dirname, "public", "media") ));

main.engine('hbs', hbs.express4());
main.set('view engine', 'hbs');
main.set('views', path.join(__dirname, '/templates'));
editor.set('views', path.join(__dirname, '/templates'))


const locals = {}

async function createUser(user:User){
    const saltRounds = 10;
    const userInstance = new User();
    //for jdenticon
    const MD5 = new jsHash.MD5;
    
    const passwordHash = await bcrypt.hash(user.password, saltRounds).then(hash=>hash);
    
    userInstance.avatar = jdenticon.toSvg(MD5.hex(user.username), 200);
    userInstance.bio = user.bio;
    userInstance.email = user.email;
    userInstance.forHire = user.forHire;
    userInstance.first_name = user.first_name;
    userInstance.last_name = user.last_name;
    userInstance.username = user.username;
    userInstance.password = passwordHash;

    await this.manager
        .persist(userInstance)
        .then(user => {
            console.log(user)
            console.log("User has been saved");
        })
        .catch(err=>{if(err){console.log(err)}});
}

database.then(async connection=>{

    console.log("Database connection established: "+connection.isConnected)
    await installSite(connection, main, editor);

    //Routes index
    postCoverPhoto(main, connection);
    photosRoute(main, connection);
    collectionsRoute(main, connection);


    main.get('/', (req, res)=>{
        const renderOptions = {
            session:req.cookies.session||false,
        }

        res.render("index", locals, injector.bind( Object.assign(
            res, 
            main.get("siteMetadata"), 
            renderOptions
        )));
    })

    main.get('/user', (req, res)=>{
        
        const isLoggedIn = "session" in req.cookies;
        const renderOptions = {
            template:isLoggedIn?"profile":"login",
            session:req.cookies.session||false,
        }

        res.render("user", injector.bind(Object.assign(res, main.get("siteMetadata"), renderOptions)))
    })

    main.get('/user/register', (req, res)=>{
        const renderOptions = {
            template:"register"
        }

        res.render("user", injector.bind(Object.assign(
            res,
            main.get("siteMetadata"), 
            renderOptions
        )))
    })
    main.post('/user/register/new', (req, res)=>{
        const formData = req.body;

        const name = {
            first:formData.first_name,
            last:formData.last_name
        }
        const bio = formData.bio;
        const email = formData.email;
        const forHire = formData.for_hire;
        const username = formData.username;
        const password = formData.password;

        createUser.bind(connection)({
            username:username,
            first_name:name.first,
            last_name:name.last,
            avatar:"",
            password:password,
            bio:bio,
            email:email,
            forHire:forHire
        })
        .catch(function(err){
            console.log(err)
        })

        res.redirect("/user");
    })

    main.post('/user/login',async (req,res)=>{

        //fake login always passes for the moment
        const usernameInput = req.body.username.toLowerCase();
        const passwordInput = req.body.password;

        console.log("login attempt", "\nUsername", usernameInput, "\nPassword", passwordInput)


        const userInstance = await connection
            .getRepository(User)
            .findOne({username:usernameInput})

        //1 find user or fail
        //2 if user check password or message user WRONG PASSWORD.
        //Note it would be easy to warn if username (specific) is wrong but for security reasons we wont.
        if(userInstance){
            //check for password
            const passwordCheck = await bcrypt.compare(passwordInput, userInstance.password);
            if(passwordCheck){
                //password correct
                //1 day 8.64e+7
                res.cookie("session",{
                    loggedIn:new Date()
                },{ maxAge: 8.64e+7, httpOnly: true })
                res.send(userInstance);
            }
            else{
                //password wrong
                res.send(false);
            }
        }
        else{
            //no such user!
            console.log("no such user")
            res.send(false)
        }
    })

    main.post("/user/logout",function(req,res){
        res.clearCookie("session");
        res.send("")
    })

    

    /**
     * Check if user exists
    */
    main.post('/user/login/check-user',async (req,res)=>{
        const username = req.body.username.toLowerCase();
        const userInstance = await connection
            .getRepository(User)
            .findOne({username:username})

        if(userInstance){
            res.send(userInstance);
        }
        else{
            res.send(false)
        }
    })

})
.catch(err=>{
    if(err){
        console.log(err)
    }
})




const port = 9000;
main.listen(port, function(){
    console.log("listening on port:",port)
});