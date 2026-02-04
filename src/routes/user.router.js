const { getAll, create, getOne, remove, update, login, verifyCode, getLoggedUser, sendEmailResetPassword, resetPassword } = require('../controllers/user.controllers');
const express = require('express');
const verifyJWT = require("../utils/verifyJWT")

const userRouter = express.Router();

userRouter.route('/users')
    .get( getAll)
    .post(create);

userRouter.route('/users/login')
    .post(login)

userRouter.route('/users/me')
    .get(verifyJWT, getLoggedUser);   

userRouter.route('/users/reset_password')
    .post(sendEmailResetPassword);  

userRouter.route('/users/reset_password/:code')
    .post(resetPassword);  
    
userRouter.route('/users/verify/:code')   
    .get(verifyCode)

userRouter.route('/users/:id')
    .get( getOne)
    .delete(verifyJWT, remove)
    .put(verifyJWT, update);

module.exports = userRouter;