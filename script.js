// Constantes
const STATUSES = [
    'pedido-recebido',
    'impresso',
    'em-separacao',
    'separado',
    'faturado',
    'aguardando-transportadora',
    'finalizado'
];

// Estado global
let pedidos = [];
let editingPedidoId = null;

// Variáveis globais para separadores
const separadorModal = new bootstrap.Modal(document.getElementById('separadorModal'));
const separadorForm = document.getElementById('separadorForm');
const confirmarSeparadorBtn = document.getElementById('confirmarSeparador');
let pedidoEmSeparacao = null;

// Variáveis globais para os gráficos
let timeChart = null;
let distributionChart = null;
let priorityChart = null;
let dailyChart = null;

// Elementos do DOM
const pedidoModal = new bootstrap.Modal(document.getElementById('pedidoModal'));
const pedidoForm = document.getElementById('pedidoForm');
const salvarPedidoBtn = document.getElementById('salvarPedido');
const excluirPedidoBtn = document.getElementById('excluirPedido');
const searchInput = document.getElementById('searchInput');
const clearSearch = document.getElementById('clearSearch');
const statusFilter = document.getElementById('statusFilter');
const priorityFilter = document.getElementById('priorityFilter');
const noResults = document.getElementById('noResults');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    try {
        carregarDados();
        initializeApp();
        updateSeparadoresMetrics();
        console.log('Aplicação inicializada com sucesso');
    } catch (error) {
        console.error('Erro ao inicializar aplicação:', error);
    }
});

// Funções de inicialização
function initializeApp() {
    setupDragAndDrop();
    setupEventListeners();
    renderPedidos();
    updateAnalytics();
}

function setupEventListeners() {
    // Botões de adicionar pedido
    document.querySelectorAll('.add-card-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            editingPedidoId = null;
            pedidoForm.reset();
            excluirPedidoBtn.style.display = 'none';
            pedidoModal.show();
        });
    });

    // Salvar pedido
    salvarPedidoBtn.addEventListener('click', salvarPedido);

    // Excluir pedido
    excluirPedidoBtn.addEventListener('click', excluirPedido);

    // Busca e filtros
    searchInput.addEventListener('input', updateSummaryTable);
    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        updateSummaryTable();
    });
    statusFilter.addEventListener('change', updateSummaryTable);
    priorityFilter.addEventListener('change', updateSummaryTable);

    // Separador
    confirmarSeparadorBtn.addEventListener('click', () => {
        const separador = document.getElementById('separador').value.trim();
        if (separador && pedidoEmSeparacao) {
            registrarSeparador(pedidoEmSeparacao, separador);
            updatePedidoStatus(pedidoEmSeparacao, 'em-separacao');
            separadorModal.hide();
            pedidoEmSeparacao = null;
        }
    });

    // Botões de ranking
    document.getElementById('rankingQuantidade').addEventListener('click', () => {
        ordenarTabelaSeparadores('quantidade');
    });

    document.getElementById('rankingVelocidade').addEventListener('click', () => {
        ordenarTabelaSeparadores('tempo');
    });
}

function ordenarTabelaSeparadores(criterio) {
    const tbody = document.getElementById('separadoresTableBody');
    const rows = Array.from(tbody.getElementsByTagName('tr'));
    
    rows.sort((a, b) => {
        if (criterio === 'quantidade') {
            const quantA = parseInt(a.cells[1].textContent);
            const quantB = parseInt(b.cells[1].textContent);
            return quantB - quantA;
        } else {
            const tempoA = parseFloat(a.cells[2].textContent);
            const tempoB = parseFloat(b.cells[2].textContent);
            return tempoA - tempoB;
        }
    });
    
    tbody.innerHTML = '';
    rows.forEach(row => tbody.appendChild(row));
}

// Funções de manipulação de pedidos
function salvarPedido() {
    if (!pedidoForm.checkValidity()) {
        pedidoForm.reportValidity();
        return;
    }

    try {
        const pedidoExistente = editingPedidoId ? pedidos.find(p => p.id === editingPedidoId) : null;
        
        const pedido = {
            id: editingPedidoId || Date.now().toString(),
            numeroPedido: document.getElementById('numeroPedido').value.trim(),
            nomeCliente: document.getElementById('nomeCliente').value.trim(),
            transportadora: document.getElementById('transportadora').value.trim(),
            prioridade: document.getElementById('prioridade').value,
            status: pedidoExistente ? pedidoExistente.status : 'pedido-recebido',
            timestamp: pedidoExistente ? pedidoExistente.timestamp : Date.now(),
            historico: pedidoExistente ? pedidoExistente.historico : { 'pedido-recebido': Date.now() },
            separador: pedidoExistente ? pedidoExistente.separador : null,
            inicioSeparacao: pedidoExistente ? pedidoExistente.inicioSeparacao : null
        };

        if (editingPedidoId) {
            const index = pedidos.findIndex(p => p.id === editingPedidoId);
            pedidos[index] = pedido;
        } else {
            pedidos.push(pedido);
        }

        salvarDados();
        renderPedidos();
        updateAnalytics();
        updateSeparadoresMetrics();
        pedidoModal.hide();
        
        console.log(`Pedido ${editingPedidoId ? 'atualizado' : 'criado'} com sucesso:`, pedido);
    } catch (error) {
        console.error('Erro ao salvar pedido:', error);
        alert('Erro ao salvar pedido. Por favor, tente novamente.');
    }
}

function excluirPedido() {
    if (!editingPedidoId) return;
    
    try {
        if (confirm('Tem certeza que deseja excluir este pedido?')) {
            const pedidoRemovido = pedidos.find(p => p.id === editingPedidoId);
            pedidos = pedidos.filter(p => p.id !== editingPedidoId);
            
            salvarDados();
            renderPedidos();
            updateAnalytics();
            updateSeparadoresMetrics();
            pedidoModal.hide();
            
            console.log('Pedido removido com sucesso:', pedidoRemovido);
        }
    } catch (error) {
        console.error('Erro ao excluir pedido:', error);
        alert('Erro ao excluir pedido. Por favor, tente novamente.');
    }
}

function renderPedidos() {
    // Primeiro, contar pedidos por coluna
    const contagem = {};
    STATUSES.forEach(status => {
        contagem[status] = pedidos.filter(p => p.status === status).length;
    });

    // Encontrar a coluna com mais pedidos (excluindo 'finalizado')
    let maiorVolume = 0;
    let statusMaiorVolume = null;
    Object.entries(contagem).forEach(([status, quantidade]) => {
        if (status !== 'finalizado' && quantidade > maiorVolume) {
            maiorVolume = quantidade;
            statusMaiorVolume = status;
        }
    });

    // Renderizar colunas e atualizar contadores
    STATUSES.forEach(status => {
        const container = document.querySelector(`[data-status="${status}"] .cards-container`);
        const column = document.querySelector(`[data-status="${status}"]`);
        container.innerHTML = '';
        
        // Atualizar classe de destaque
        if (status === statusMaiorVolume && maiorVolume > 0) {
            column.classList.add('highlight');
        } else {
            column.classList.remove('highlight');
        }
        
        const pedidosFiltrados = pedidos.filter(p => p.status === status);
        pedidosFiltrados.forEach(pedido => {
            const card = criarCardPedido(pedido);
            container.appendChild(card);
        });

        // Atualizar contador
        const countElement = document.getElementById(`count-${status}`);
        if (countElement) {
            countElement.textContent = pedidosFiltrados.length;
        }
    });
    
    // Atualizar event listeners de drag and drop
    setupDragAndDrop();
    updateAnalytics();
}

function criarCardPedido(pedido) {
    const card = document.createElement('div');
    card.className = `card ${pedido.prioridade}`;
    card.draggable = true;
    card.dataset.id = pedido.id;

    const nextStepBtn = document.createElement('button');
    nextStepBtn.className = 'next-step-btn';
    nextStepBtn.innerHTML = '<i class="bi bi-arrow-right"></i>';
    nextStepBtn.title = 'Avançar para próxima etapa';
    nextStepBtn.onclick = (e) => {
        e.stopPropagation();
        moveToNextStep(pedido.id);
    };

    let dataFinalizacao = '';
    if (pedido.status === 'finalizado' && pedido.historico && pedido.historico.finalizado) {
        dataFinalizacao = `<p><strong>Finalizado em:</strong> ${formatarData(pedido.historico.finalizado)}</p>`;
    }

    card.innerHTML = `
        <h4>Pedido #${pedido.numeroPedido}</h4>
        <p><strong>Cliente:</strong> ${pedido.nomeCliente}</p>
        <p><strong>Transportadora:</strong> ${pedido.transportadora}</p>
        <p><strong>Prioridade:</strong> <span class="prioridade-badge ${pedido.prioridade}">${pedido.prioridade}</span></p>
        <p><strong>Início:</strong> ${formatarData(pedido.timestamp)}</p>
        ${dataFinalizacao}
    `;

    // Não mostrar botão de avançar se estiver finalizado
    if (pedido.status !== 'finalizado') {
        card.appendChild(nextStepBtn);
    }

    // Adicionar botão de editar
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-outline-primary edit-btn';
    editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
    editBtn.onclick = (e) => {
        e.stopPropagation();
        editingPedidoId = pedido.id;
        document.getElementById('numeroPedido').value = pedido.numeroPedido;
        document.getElementById('nomeCliente').value = pedido.nomeCliente;
        document.getElementById('transportadora').value = pedido.transportadora;
        document.getElementById('prioridade').value = pedido.prioridade;
        excluirPedidoBtn.style.display = 'inline-block';
        pedidoModal.show();
    };
    card.appendChild(editBtn);

    return card;
}

// Funções de drag and drop
function setupDragAndDrop() {
    // Remover event listeners antigos
    document.querySelectorAll('.card').forEach(card => {
        card.removeEventListener('dragstart', dragStart);
        card.removeEventListener('dragend', dragEnd);
    });

    document.querySelectorAll('.kanban-column').forEach(column => {
        column.removeEventListener('dragover', dragOver);
        column.removeEventListener('drop', drop);
    });

    // Adicionar novos event listeners
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('dragstart', dragStart);
        card.addEventListener('dragend', dragEnd);
    });

    document.querySelectorAll('.kanban-column').forEach(column => {
        column.addEventListener('dragover', dragOver);
        column.addEventListener('drop', drop);
    });
}

function dragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', e.target.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
}

function dragEnd(e) {
    e.target.classList.remove('dragging');
}

function dragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function drop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const pedidoId = e.dataTransfer.getData('text/plain');
    const novoStatus = e.currentTarget.dataset.status;
    
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (pedido) {
        // Preservar informações do separador
        const separadorInfo = {
            separador: pedido.separador,
            inicioSeparacao: pedido.inicioSeparacao
        };

        // Atualizar histórico e status
        pedido.historico = {
            ...pedido.historico,
            [novoStatus]: Date.now()
        };
        pedido.status = novoStatus;

        // Restaurar informações do separador
        pedido.separador = separadorInfo.separador;
        pedido.inicioSeparacao = separadorInfo.inicioSeparacao;

        salvarDados();
        renderPedidos();
        updateAnalytics();
        updateSeparadoresMetrics();
    }
}

// Funções de análise
function updateAnalytics() {
    try {
        console.log('Atualizando analytics...');
        
        // Atualizar métricas principais
        updateMetrics();
        
        // Atualizar todos os gráficos
        updateTimeChart();
        updateDistributionChart();
        updatePriorityChart();
        updateDailyChart();
        
        // Atualizar tabela de resumo
        updateSummaryTable();
        
        console.log('Analytics atualizados com sucesso');
    } catch (error) {
        console.error('Erro ao atualizar analytics:', error);
    }
}

function updateMetrics() {
    try {
        // Atualizar contadores de cada coluna
        STATUSES.forEach(status => {
            const count = pedidos.filter(p => p.status === status).length;
            const countElement = document.getElementById(`count-${status}`);
            if (countElement) {
                countElement.textContent = count;
            }
        });

        // Atualizar métricas principais
        const pedidosAndamento = pedidos.filter(p => p.status !== 'finalizado').length;
        // Contar apenas pedidos urgentes que não estão finalizados
        const pedidosUrgentes = pedidos.filter(p => p.prioridade === 'urgente' && p.status !== 'finalizado').length;
        const pedidosFinalizados = pedidos.filter(p => p.status === 'finalizado').length;
        const taxaConclusao = pedidos.length > 0 ? 
            Math.round((pedidosFinalizados / pedidos.length) * 100) : 0;
        
        document.getElementById('pedidosAndamento').textContent = pedidosAndamento;
        document.getElementById('pedidosUrgentes').textContent = pedidosUrgentes;
        document.getElementById('taxaConclusao').textContent = `${taxaConclusao}%`;
        
        const tempoMedioTotal = calcularTempoMedioTotal();
        document.getElementById('tempoMedioTotal').textContent = formatarTempo(tempoMedioTotal);

        console.log('Métricas atualizadas:', {
            pedidosAndamento,
            pedidosUrgentes,
            pedidosFinalizados,
            taxaConclusao,
            tempoMedioTotal
        });
    } catch (error) {
        console.error('Erro ao atualizar métricas:', error);
    }
}

function updateTimeChart() {
    try {
        const ctx = document.getElementById('timeChart').getContext('2d');
        const temposMedios = calcularTemposMediosPorEtapa();
        
        if (timeChart) {
            timeChart.destroy();
        }
        
        timeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: STATUSES.map(status => formatarStatus(status)),
                datasets: [{
                    label: 'Tempo Médio (minutos)',
                    data: temposMedios,
                    backgroundColor: 'rgba(67, 97, 238, 0.5)',
                    borderColor: 'rgba(67, 97, 238, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Tempo (minutos)'
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Tempo médio: ${formatarTempo(context.raw)}`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao atualizar gráfico de tempo:', error);
    }
}

function updateDistributionChart() {
    try {
        const ctx = document.getElementById('distributionChart').getContext('2d');
        const distribuicao = STATUSES.map(status => 
            pedidos.filter(p => p.status === status).length
        );
        
        if (distributionChart) {
            distributionChart.destroy();
        }
        
        distributionChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: STATUSES.map(status => formatarStatus(status)),
                datasets: [{
                    data: distribuicao,
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.5)',
                        'rgba(54, 162, 235, 0.5)',
                        'rgba(255, 206, 86, 0.5)',
                        'rgba(75, 192, 192, 0.5)',
                        'rgba(153, 102, 255, 0.5)',
                        'rgba(255, 159, 64, 0.5)',
                        'rgba(199, 199, 199, 0.5)'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao atualizar gráfico de distribuição:', error);
    }
}

function updatePriorityChart() {
    try {
        const ctx = document.getElementById('priorityChart').getContext('2d');
        // Filtrar pedidos não finalizados para cada prioridade
        const urgentes = pedidos.filter(p => p.prioridade === 'urgente' && p.status !== 'finalizado').length;
        const normais = pedidos.filter(p => p.prioridade === 'normal' && p.status !== 'finalizado').length;
        
        if (priorityChart) {
            priorityChart.destroy();
        }
        
        priorityChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Urgentes', 'Normais'],
                datasets: [{
                    data: [urgentes, normais],
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.5)',
                        'rgba(54, 162, 235, 0.5)'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right'
                    },
                    title: {
                        display: true,
                        text: 'Distribuição de Prioridades (Pedidos em Andamento)'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = urgentes + normais;
                                const porcentagem = total > 0 ? Math.round((context.raw / total) * 100) : 0;
                                return `${context.label}: ${context.raw} (${porcentagem}%)`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao atualizar gráfico de prioridade:', error);
    }
}

function updateDailyChart() {
    try {
        const ctx = document.getElementById('dailyChart').getContext('2d');
        const ultimos7Dias = Array.from({length: 7}, (_, i) => {
            const data = new Date();
            data.setDate(data.getDate() - i);
            return data.toLocaleDateString();
        }).reverse();
        
        const pedidosPorDia = ultimos7Dias.map(data => 
            pedidos.filter(p => new Date(p.timestamp).toLocaleDateString() === data).length
        );
        
        if (dailyChart) {
            dailyChart.destroy();
        }
        
        dailyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ultimos7Dias,
                datasets: [{
                    label: 'Pedidos por Dia',
                    data: pedidosPorDia,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao atualizar gráfico diário:', error);
    }
}

function updateSummaryTable() {
    const tbody = document.getElementById('summaryTableBody');
    tbody.innerHTML = '';
    
    const searchTerm = searchInput.value.toLowerCase();
    const selectedStatus = statusFilter.value;
    const selectedPriority = priorityFilter.value;
    
    const pedidosFiltrados = pedidos.filter(pedido => {
        const matchesSearch = 
            pedido.numeroPedido.toLowerCase().includes(searchTerm) ||
            pedido.nomeCliente.toLowerCase().includes(searchTerm) ||
            pedido.transportadora.toLowerCase().includes(searchTerm);
        
        const matchesStatus = !selectedStatus || pedido.status === selectedStatus;
        const matchesPriority = !selectedPriority || pedido.prioridade === selectedPriority;
        
        return matchesSearch && matchesStatus && matchesPriority;
    });
    
    if (pedidosFiltrados.length === 0) {
        noResults.style.display = 'flex';
        return;
    }
    
    noResults.style.display = 'none';
    
    pedidosFiltrados.forEach(pedido => {
        const tr = document.createElement('tr');
        const tempoPorEtapa = calcularTempoPorEtapa(pedido);
        
        tr.innerHTML = `
            <td>${pedido.numeroPedido}</td>
            <td>${pedido.nomeCliente}</td>
            <td>${pedido.transportadora}</td>
            <td>
                <span class="prioridade-badge ${pedido.prioridade}">
                    ${pedido.prioridade}
                </span>
            </td>
            <td>
                <span class="status-badge ${pedido.status}">
                    ${formatarStatus(pedido.status)}
                </span>
            </td>
            <td>${formatarData(pedido.timestamp)}</td>
            <td>${formatarTempo(calcularTempoTotal(pedido))}</td>
            <td class="tempo-etapa">
                ${formatarTemposPorEtapa(tempoPorEtapa)}
            </td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${pedido.id}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${pedido.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(tr);
    });

    // Adicionar event listeners para os botões
    setupTableButtons();
}

function formatarStatus(status) {
    return status.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

function formatarData(timestamp) {
    const data = new Date(timestamp);
    return data.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatarTempo(minutos) {
    if (minutos < 60) {
        return `${Math.round(minutos)}min`;
    }
    const horas = Math.floor(minutos / 60);
    const min = Math.round(minutos % 60);
    return `${horas}h${min}min`;
}

function formatarTemposPorEtapa(tempos) {
    return Object.entries(tempos)
        .filter(([status, tempo]) => tempo > 0) // Mostrar apenas tempos positivos
        .map(([status, tempo]) => `
            <span>
                <i class="bi bi-circle-fill"></i>
                ${formatarStatus(status)}: ${formatarTempo(tempo)}
            </span>
        `)
        .join('');
}

function setupTableButtons() {
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('.btn').dataset.id;
            const pedido = pedidos.find(p => p.id === id);
            if (pedido) {
                editingPedidoId = id;
                document.getElementById('numeroPedido').value = pedido.numeroPedido;
                document.getElementById('nomeCliente').value = pedido.nomeCliente;
                document.getElementById('transportadora').value = pedido.transportadora;
                document.getElementById('prioridade').value = pedido.prioridade;
                excluirPedidoBtn.style.display = 'inline-block';
                pedidoModal.show();
            }
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('.btn').dataset.id;
            if (confirm('Tem certeza que deseja excluir este pedido?')) {
                pedidos = pedidos.filter(p => p.id !== id);
                salvarDados();
                renderPedidos();
                updateAnalytics();
                updateSeparadoresMetrics();
            }
        });
    });
}

function calcularTempoPorEtapa(pedido) {
    const tempos = {};
    const statusOrdenados = [...STATUSES];
    
    // Para cada status no histórico
    statusOrdenados.forEach((status, index) => {
        if (pedido.historico && pedido.historico[status]) {
            // Tempo inicial é o timestamp do status anterior ou o timestamp inicial do pedido
            const statusAnterior = index > 0 ? statusOrdenados[index - 1] : null;
            const tempoInicial = statusAnterior && pedido.historico[statusAnterior] 
                ? pedido.historico[statusAnterior] 
                : pedido.timestamp;
            
            // Tempo final é o timestamp do status atual
            const tempoFinal = pedido.historico[status];
            
            // Calcular tempo em minutos
            const tempoEtapa = Math.round((new Date(tempoFinal) - new Date(tempoInicial)) / (1000 * 60));
            
            // Armazenar o tempo no status anterior, pois é o tempo que passou naquela etapa
            if (statusAnterior) {
                tempos[statusAnterior] = tempoEtapa;
            }
        }
    });
    
    // Calcular tempo da etapa atual
    const statusAtual = pedido.status;
    const ultimoStatus = pedido.historico[statusAtual];
    if (ultimoStatus) {
        const tempoAtual = Math.round((new Date() - new Date(ultimoStatus)) / (1000 * 60));
        tempos[statusAtual] = tempoAtual;
    }
    
    return tempos;
}

function calcularTempoTotal(pedido) {
    return (new Date() - new Date(pedido.timestamp)) / (1000 * 60);
}

function calcularTempoMedioTotal() {
    const pedidosFinalizados = pedidos.filter(p => p.status === 'finalizado');
    if (pedidosFinalizados.length === 0) return 0;
    
    const tempoTotal = pedidosFinalizados.reduce((acc, pedido) => {
        const inicio = new Date(pedido.timestamp);
        const fim = new Date(pedido.historico.finalizado);
        return acc + ((fim - inicio) / (1000 * 60));
    }, 0);
    
    return Math.round(tempoTotal / pedidosFinalizados.length);
}

function calcularTemposMediosPorEtapa() {
    try {
        console.log('Calculando tempos médios por etapa...');
        
        const temposPorEtapa = {};
        
        // Inicializar contadores para cada status
        STATUSES.forEach(status => {
            temposPorEtapa[status] = {
                tempoTotal: 0,
                quantidade: 0
            };
        });
        
        // Calcular tempos para cada pedido
        pedidos.forEach(pedido => {
            if (!pedido.historico) return;
            
            const statusOrdenados = [...STATUSES];
            
            statusOrdenados.forEach((status, index) => {
                if (pedido.historico[status]) {
                    // Encontrar o tempo inicial (timestamp do status anterior ou timestamp inicial do pedido)
                    const statusAnterior = index > 0 ? statusOrdenados[index - 1] : null;
                    const tempoInicial = statusAnterior && pedido.historico[statusAnterior] 
                        ? pedido.historico[statusAnterior] 
                        : pedido.timestamp;
                    
                    // Tempo final é o timestamp do status atual
                    const tempoFinal = pedido.historico[status];
                    
                    // Calcular tempo em minutos
                    const tempoEtapa = Math.round((new Date(tempoFinal) - new Date(tempoInicial)) / (1000 * 60));
                    
                    // Adicionar ao status anterior, pois é o tempo que passou naquela etapa
                    if (statusAnterior) {
                        temposPorEtapa[statusAnterior].tempoTotal += tempoEtapa;
                        temposPorEtapa[statusAnterior].quantidade++;
                    }
                }
            });
            
            // Calcular tempo da etapa atual se ainda não finalizou
            if (pedido.status !== 'finalizado' && pedido.historico[pedido.status]) {
                const tempoAtual = Math.round((new Date() - new Date(pedido.historico[pedido.status])) / (1000 * 60));
                temposPorEtapa[pedido.status].tempoTotal += tempoAtual;
                temposPorEtapa[pedido.status].quantidade++;
            }
        });
        
        // Calcular médias
        const temposMedios = STATUSES.map(status => {
            const { tempoTotal, quantidade } = temposPorEtapa[status];
            const media = quantidade > 0 ? Math.round(tempoTotal / quantidade) : 0;
            console.log(`Tempo médio para ${status}: ${media} minutos (Total: ${tempoTotal}, Quantidade: ${quantidade})`);
            return media;
        });
        
        return temposMedios;
    } catch (error) {
        console.error('Erro ao calcular tempos médios por etapa:', error);
        return STATUSES.map(() => 0);
    }
}

function calcularTempoEtapa(pedido, status) {
    if (!pedido.historico || !pedido.historico[status]) return 0;
    
    const statusIndex = STATUSES.indexOf(status);
    const statusAnterior = statusIndex > 0 ? STATUSES[statusIndex - 1] : null;
    
    const tempoInicio = statusAnterior && pedido.historico[statusAnterior] 
        ? pedido.historico[statusAnterior] 
        : pedido.timestamp;
    
    return (new Date(pedido.historico[status]) - new Date(tempoInicio)) / (1000 * 60);
}

// Funções auxiliares
function salvarDados() {
    try {
        const dados = {
            pedidos: pedidos.map(pedido => ({
                ...pedido,
                separador: pedido.separador || null,
                inicioSeparacao: pedido.inicioSeparacao || null,
                historico: pedido.historico || {}
            }))
        };
        localStorage.setItem('kanbanData', JSON.stringify(dados));
        console.log('Dados salvos com sucesso');
    } catch (error) {
        console.error('Erro ao salvar dados:', error);
    }
}

function moveToNextStep(pedidoId) {
    try {
        const pedido = pedidos.find(p => p.id === pedidoId);
        if (!pedido) {
            console.error('Pedido não encontrado:', pedidoId);
            return;
        }

        const currentIndex = STATUSES.indexOf(pedido.status);
        if (currentIndex < STATUSES.length - 1) {
            const nextStatus = STATUSES[currentIndex + 1];
            
            // Se o próximo status for 'em-separacao', mostrar modal do separador
            if (nextStatus === 'em-separacao') {
                pedidoEmSeparacao = pedidoId;
                document.getElementById('separador').value = '';
                separadorModal.show();
                return;
            }
            
            // Preservar informações do separador
            const separadorInfo = {
                separador: pedido.separador,
                inicioSeparacao: pedido.inicioSeparacao
            };

            updatePedidoStatus(pedidoId, nextStatus);

            // Restaurar informações do separador
            const pedidoAtualizado = pedidos.find(p => p.id === pedidoId);
            if (pedidoAtualizado) {
                pedidoAtualizado.separador = separadorInfo.separador;
                pedidoAtualizado.inicioSeparacao = separadorInfo.inicioSeparacao;
                salvarDados();
            }
            
            console.log(`Pedido ${pedidoId} movido para ${nextStatus}`);
        }
    } catch (error) {
        console.error('Erro ao mover pedido para próxima etapa:', error);
    }
}

function updatePedidoStatus(pedidoId, nextStatus) {
    try {
        const pedido = pedidos.find(p => p.id === pedidoId);
        if (!pedido) {
            console.error('Pedido não encontrado:', pedidoId);
            return;
        }

        // Preservar informações do separador
        const separadorInfo = {
            separador: pedido.separador,
            inicioSeparacao: pedido.inicioSeparacao
        };

        // Atualizar histórico e status
        pedido.historico = {
            ...pedido.historico,
            [nextStatus]: Date.now()
        };
        pedido.status = nextStatus;

        // Restaurar informações do separador
        pedido.separador = separadorInfo.separador;
        pedido.inicioSeparacao = separadorInfo.inicioSeparacao;

        salvarDados();
        renderPedidos();
        updateAnalytics();
        updateSeparadoresMetrics();
        
        console.log(`Status do pedido ${pedidoId} atualizado para ${nextStatus}`);
    } catch (error) {
        console.error('Erro ao atualizar status do pedido:', error);
    }
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
}

// Funções para gerenciar separadores
function atualizarListaSeparadores() {
    const separadores = new Set();
    pedidos.forEach(pedido => {
        if (pedido.separador) {
            separadores.add(pedido.separador);
        }
    });

    const datalist = document.getElementById('separadoresList');
    datalist.innerHTML = Array.from(separadores)
        .map(separador => `<option value="${separador}">`)
        .join('');
}

function registrarSeparador(pedidoId, separador) {
    try {
        console.log('Registrando separador:', separador, 'para pedido:', pedidoId);
        
        const pedido = pedidos.find(p => p.id === pedidoId);
        if (!pedido) {
            console.error('Pedido não encontrado:', pedidoId);
            return;
        }

        pedido.separador = separador;
        pedido.inicioSeparacao = Date.now();
        
        salvarDados();
        renderPedidos();
        updateAnalytics();
        updateSeparadoresMetrics();
        
        console.log('Separador registrado com sucesso:', pedido);
    } catch (error) {
        console.error('Erro ao registrar separador:', error);
    }
}

function calcularMetricasSeparadores() {
    try {
        console.log('Calculando métricas dos separadores...');
        console.log('Número de pedidos:', pedidos.length);
        
        const metricas = {};
        
        pedidos.forEach(pedido => {
            console.log('Verificando pedido:', pedido);
            
            // Verifica se o pedido tem separador registrado
            if (pedido.separador && pedido.inicioSeparacao) {
                console.log('Pedido com separador:', pedido.separador);
                
                if (!metricas[pedido.separador]) {
                    metricas[pedido.separador] = {
                        quantidade: 0,
                        tempoTotal: 0,
                        tempoMedio: 0,
                        pedidosSeparados: []
                    };
                }
                
                // Calcula o tempo de separação
                let tempoSeparacao = 0;
                
                // Se o pedido já passou da etapa de separação (tem registro no histórico)
                if (pedido.historico && pedido.historico.separado) {
                    tempoSeparacao = (new Date(pedido.historico.separado) - new Date(pedido.inicioSeparacao)) / (1000 * 60);
                }
                // Se ainda está em separação, calcula o tempo até agora
                else if (pedido.status === 'em-separacao') {
                    tempoSeparacao = (new Date() - new Date(pedido.inicioSeparacao)) / (1000 * 60);
                }
                
                // Se temos um tempo válido, atualizamos as métricas
                if (tempoSeparacao > 0) {
                    metricas[pedido.separador].quantidade++;
                    metricas[pedido.separador].tempoTotal += tempoSeparacao;
                    metricas[pedido.separador].pedidosSeparados.push({
                        id: pedido.id,
                        tempo: tempoSeparacao,
                        status: pedido.status
                    });
                    
                    console.log(`Tempo de separação para pedido ${pedido.id}: ${tempoSeparacao} minutos`);
                }
            }
        });
        
        // Calcular médias e eficiência
        Object.entries(metricas).forEach(([separador, metrica]) => {
            metrica.tempoMedio = metrica.quantidade > 0 
                ? metrica.tempoTotal / metrica.quantidade 
                : 0;
            console.log(`Métricas para ${separador}:`, metrica);
        });
        
        console.log('Métricas calculadas:', metricas);
        return metricas;
    } catch (error) {
        console.error('Erro ao calcular métricas dos separadores:', error);
        return {};
    }
}

function updateSeparadoresMetrics() {
    try {
        const metricas = calcularMetricasSeparadores();
        updateSeparadoresTable(metricas);
        updateSeparadoresCharts(metricas);
    } catch (error) {
        console.error('Erro ao atualizar métricas dos separadores:', error);
    }
}

function updateSeparadoresTable(metricas) {
    try {
        const tbody = document.getElementById('separadoresTableBody');
        tbody.innerHTML = '';
        
        Object.entries(metricas)
            .sort((a, b) => b[1].quantidade - a[1].quantidade)
            .forEach(([separador, metrica]) => {
                const eficiencia = calcularEficiencia(metrica.tempoMedio);
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${separador}</td>
                    <td>${metrica.quantidade}</td>
                    <td>${formatarTempo(metrica.tempoMedio)}</td>
                    <td>${formatarTempo(metrica.tempoTotal)}</td>
                    <td><span class="eficiencia-badge ${eficiencia.classe}">${eficiencia.texto}</span></td>
                `;
                tbody.appendChild(tr);
                
                console.log(`Linha adicionada para ${separador}:`, {
                    quantidade: metrica.quantidade,
                    tempoMedio: metrica.tempoMedio,
                    tempoTotal: metrica.tempoTotal,
                    eficiencia: eficiencia
                });
            });
    } catch (error) {
        console.error('Erro ao atualizar tabela de separadores:', error);
    }
}

function updateSeparadoresCharts(metricas) {
    // Gráfico de quantidade
    const ctxQuantidade = document.getElementById('separadoresQuantidadeChart').getContext('2d');
    new Chart(ctxQuantidade, {
        type: 'bar',
        data: {
            labels: Object.keys(metricas),
            datasets: [{
                label: 'Quantidade de Pedidos',
                data: Object.values(metricas).map(m => m.quantidade),
                backgroundColor: 'rgba(67, 97, 238, 0.5)',
                borderColor: 'rgba(67, 97, 238, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Quantidade'
                    }
                }
            }
        }
    });

    // Gráfico de tempo médio
    const ctxTempo = document.getElementById('separadoresTempoChart').getContext('2d');
    new Chart(ctxTempo, {
        type: 'bar',
        data: {
            labels: Object.keys(metricas),
            datasets: [{
                label: 'Tempo Médio (min)',
                data: Object.values(metricas).map(m => Math.round(m.tempoMedio)),
                backgroundColor: 'rgba(76, 201, 240, 0.5)',
                borderColor: 'rgba(76, 201, 240, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Minutos'
                    }
                }
            }
        }
    });
}

function calcularEficiencia(tempoMedio) {
    try {
        if (tempoMedio === 0) return { texto: 'N/A', classe: '' };
        if (tempoMedio <= 15) return { texto: 'Alta', classe: 'alta' };
        if (tempoMedio <= 30) return { texto: 'Média', classe: 'media' };
        return { texto: 'Baixa', classe: 'baixa' };
    } catch (error) {
        console.error('Erro ao calcular eficiência:', error);
        return { texto: 'N/A', classe: '' };
    }
}

// Carregar dados do localStorage
function carregarDados() {
    try {
        const dadosSalvos = localStorage.getItem('kanbanData');
        if (dadosSalvos) {
            const dados = JSON.parse(dadosSalvos);
            pedidos = dados.pedidos || [];
            
            // Garantir que todos os pedidos tenham as propriedades necessárias
            pedidos = pedidos.map(pedido => ({
                id: pedido.id || Date.now().toString(),
                numeroPedido: pedido.numeroPedido || '',
                nomeCliente: pedido.nomeCliente || '',
                transportadora: pedido.transportadora || '',
                prioridade: pedido.prioridade || 'normal',
                status: pedido.status || 'pedido-recebido',
                timestamp: pedido.timestamp || Date.now(),
                historico: pedido.historico || {},
                separador: pedido.separador || null,
                inicioSeparacao: pedido.inicioSeparacao || null
            }));
            
            atualizarListaSeparadores();
            console.log('Dados carregados com sucesso:', pedidos.length, 'pedidos');
        }
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        pedidos = [];
    }
} 