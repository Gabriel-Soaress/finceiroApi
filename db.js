//a senha está armazenada no arquivo .env para segurança, aqui puxamos o dotenv para ler o arquivo .env
require('dotenv').config();


// 2. Traz a ferramenta 'Pool' do pacote 'pg' (PostgreSQL)
// ANALOGIA: O 'Pool' é como uma rodoviária. Em vez de enviar um carro (conexão)
// para cada pedido, ele gerencia vários "ônibus" que ficam indo e voltando para a nuvem.

const { Pool } = require('pg');


const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_DATABASE,

    ssl:{rejectUnauthorized: false}
})


async function testarConexao(){
    let conexao;

    try{
        conexao = await pool.connect();
        console.log("Conexão estabelecida com Neon.tech")
    
    
    }catch(erro){
        console.error('Erro ao conectar:', erro);

    }finally{
        if(conexao){
            conexao.release();
        }
    }
}

testarConexao();

module.exports = pool;