import express,{Request,Response} from 'express';

import cors from 'cors';

const app = express();

app.use(cors({
    origin:"http://localhost:5273",
    credentials:true
}));
app.use(express.json());
const PORT = Number(process.env.PORT || 3000);

app.get("/",(request:Request,response:Response)=>{
     response.json({message:"Hello CleanChat"});
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    })
}
export default app;
