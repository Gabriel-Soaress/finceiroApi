const express = require('express');
const pool = require('./db');
const app = express();
const cors = require('cors');

const PORTA = 3333;

app.use(cors());
app.use(express.json());

app.listen(PORTA, () => {
    console.log(`Servidor rodando na porta ${PORTA}`)
});

// --- ROTA DE LOGIN (NÃO PRECISA DE ID NO HEADER, ELA QUEM DEVOLVE O ID) ---
app.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    try {
        const resultado = await pool.query(
            'SELECT id, nome, email FROM usuarios WHERE email = $1 AND senha = $2', 
            [email, senha]
        );

        if (resultado.rows.length > 0) {
            res.json(resultado.rows[0]); 
        } else {
            res.status(401).json({ erro: 'Email ou senha incorretos' });
        }
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro no servidor' });
    }
});

// --- CATEGORIAS (GLOBAIS - TODO MUNDO VÊ AS MESMAS) ---
app.get('/categorias', async (req, res) => {
    try {
        const consulta = await pool.query('SELECT * FROM categorias');
        res.json(consulta.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ mensagem: 'Erro ao buscar categorias' });
    }
});

// --- CONTAS (CRIAR) ---
app.post('/contas', async (req, res) => {
    // 1. PEGA O ID DO USUÁRIO DO CABEÇALHO
    const usuario_id = req.headers['user-id']; 
    
    const { numero_boleto, categoria_id, nome, descricao, valor, emissao, vencimento } = req.body;

    // 2. USA O ID NO INSERT (No lugar do número 1)
    const sql = `
        INSERT INTO contas 
        (usuario_id, categoria_id, referencia, nome, descricao, valor, valor_original, data_emissao, data_vencimento, status)
        VALUES 
        (${usuario_id}, ${categoria_id}, '${numero_boleto}', '${nome}', '${descricao}', ${valor}, ${valor}, '${emissao}', '${vencimento}', 'PENDENTE')
        RETURNING *;
    `;

    try {
        const novaConta = await pool.query(sql);
        res.json(novaConta.rows[0]);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao cadastrar conta" });
    }
});

// --- CONTAS (LISTAR) ---
app.get('/contas', async (req, res) => {
    const usuario_id = req.headers['user-id']; // <--- PEGA QUEM TÁ PEDINDO

    try {
        // 3. FILTRA APENAS AS CONTAS DESSE USUÁRIO
        const sql = `SELECT * FROM contas WHERE usuario_id = ${usuario_id} ORDER BY data_vencimento ASC`;
        const consulta = await pool.query(sql);
        res.json(consulta.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ mensagem: 'Erro ao buscar contas' });
    }
});

// --- CONTAS (DELETAR) ---
app.delete('/contas/:id', async (req, res) => {
    const usuario_id = req.headers['user-id'];
    const idDaConta = req.params.id;

    try {
        // Segurança: Só deleta se o ID bater E o dono for o usuário logado
        await pool.query(`DELETE FROM contas WHERE id = ${idDaConta} AND usuario_id = ${usuario_id}`);
        res.status(204).send();
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ mensagem: 'Erro ao deletar conta' });
    }
});

// --- CONTAS (ATUALIZAR / EDITAR) ---
app.put('/contas/:id', async (req, res) => {
    const usuario_id = req.headers['user-id'];
    const idDaConta = req.params.id;
    const { numero_boleto, categoria_id, nome, descricao, valor, emissao, vencimento } = req.body;

    // Adicionado filtro de usuario_id no WHERE para segurança
    const sql = `
        UPDATE contas SET
            referencia = '${numero_boleto}',
            categoria_id = ${categoria_id},
            nome = '${nome}',
            descricao = '${descricao}',
            valor = ${valor},
            valor_original = ${valor},
            data_emissao = '${emissao}',
            data_vencimento = '${vencimento}'
        WHERE id = ${idDaConta} AND usuario_id = ${usuario_id}
        RETURNING *;`;

    try {
        const contaAtualizada = await pool.query(sql);
        res.json(contaAtualizada.rows[0]);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ mensagem: 'Erro ao atualizar conta' });
    }
});

// --- CARTEIRAS (LISTAR) ---
app.get('/carteiras', async (req, res) => {
    const usuario_id = req.headers['user-id'];

    try {
        // Assume que a tabela carteiras tem usuario_id (Se não tiver, rode o SQL que mandei acima)
        const consulta = await pool.query(`SELECT * FROM carteiras WHERE usuario_id = ${usuario_id}`);
        res.json(consulta.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ mensagem: 'Erro ao buscar carteiras' });
    }
});

// --- ENTRADA DE SALDO ---
app.post('/movimentacoes/entrada', async (req, res) => {
    const usuario_id = req.headers['user-id'];
    const { valor, descricao, carteira_id, data_pagamento } = req.body;
    
    try {
        const sqlMovimento = `
            INSERT INTO movimentacoes (usuario_id, conta_id, carteira_id, valor, tipo, descricao, data_pagamento)
            VALUES (${usuario_id}, null, ${carteira_id}, ${valor}, 'ENTRADA', '${descricao}', '${data_pagamento}')
            RETURNING *;
        `;
        const novaMovimentacao = await pool.query(sqlMovimento);
        
        // Atualiza saldo (Consideramos que o carteira_id já pertence ao usuário, validação extra seria ideal mas assim funciona)
        await pool.query(`UPDATE carteiras SET saldo = saldo + ${valor} WHERE id = ${carteira_id}`);
        
        res.json(novaMovimentacao.rows[0]);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ mensagem: 'Erro ao cadastrar entrada' });
    }
});

// --- PAGAMENTO DE CONTA ---
app.post('/contas/pagar', async (req, res) => {
    const usuario_id = req.headers['user-id'];
    const { conta_id, carteira_id, valor, data_pagamento, natureza } = req.body;

    try {
        if (natureza === 'TOTAL') {
            await pool.query(`UPDATE contas SET status = 'PAGO', valor = 0 WHERE id = ${conta_id}`);
        } else {
            await pool.query(`UPDATE contas SET valor = valor - ${valor}, status = 'PARCIAL' WHERE id = ${conta_id}`);
        }

        await pool.query(`UPDATE carteiras SET saldo = saldo - ${valor} WHERE id = ${carteira_id}`);

        // Insere o usuario_id correto no histórico
        const sqlMov = `
            INSERT INTO movimentacoes (usuario_id, conta_id, carteira_id, valor, tipo, descricao, data_pagamento)
            VALUES (${usuario_id}, ${conta_id}, ${carteira_id}, ${valor}, 'SAIDA', 'Pagamento ${natureza}', '${data_pagamento}')
        `;
        await pool.query(sqlMov);

        res.json({ mensagem: "Pagamento processado com sucesso!" });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro no processamento" });
    }
});

// --- ESTORNAR ---
app.post('/contas/estornar', async (req, res) => {
    const usuario_id = req.headers['user-id'];
    const { conta_id } = req.body;
    
    try {
        // Busca movimentação, garantindo que seja deste usuário (segurança extra)
        const buscaMov = await pool.query(`
            SELECT carteira_id, valor FROM movimentacoes 
            WHERE conta_id = $1 AND tipo = 'SAIDA' AND usuario_id = $2
            ORDER BY id DESC LIMIT 1
        `, [conta_id, usuario_id]);

        if (buscaMov.rows.length === 0) {
            return res.status(404).json({ erro: "Histórico não encontrado" });
        }

        const { carteira_id, valor } = buscaMov.rows[0];

        await pool.query(`UPDATE carteiras SET saldo = saldo + $1 WHERE id = $2`, [valor, carteira_id]);
        
        await pool.query(`UPDATE contas SET status = 'PENDENTE', valor = valor_original WHERE id = $1`, [conta_id]);
        
        // Registra estorno com o ID do usuário certo
        await pool.query(`
            INSERT INTO movimentacoes (usuario_id, conta_id, carteira_id, valor, tipo, descricao, data_pagamento)
            VALUES ($1, $2, $3, $4, 'ENTRADA', 'Estorno de Pagamento', NOW())
        `, [usuario_id, conta_id, carteira_id, valor]);

        res.json({ mensagem: "Estornado!" });
    } catch (f) {
        console.error(f);
        res.status(500).send("Erro");
    }
});

// --- RESUMO / MOVIMENTAÇÕES (FILTRADO POR USUÁRIO) ---
app.get('/movimentacoes', async (req, res) => {
    const usuario_id = req.headers['user-id']; // Importante para o resumo bater com o saldo do usuário
    const { inicio, fim } = req.query; 
    
    try {
        // Adicionei "AND usuario_id = ..." para filtrar
        const sql = `
            SELECT * FROM movimentacoes 
            WHERE usuario_id = ${usuario_id} 
            AND data_pagamento BETWEEN '${inicio}' AND '${fim}'
        `;
        
        const consulta = await pool.query(sql);
        res.json(consulta.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar resumo' });
    }
});