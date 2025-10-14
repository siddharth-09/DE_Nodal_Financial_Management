'use client';

import { useState, useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Home() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [totalAmount, setTotalAmount] = useState('');
  const [budgetId, setBudgetId] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [newExpense, setNewExpense] = useState({ itemName: '', amount: '', note: '' });
  const [editMode, setEditMode] = useState(false);
  const [editingNodes, setEditingNodes] = useState([]);
  
  const cyRef = useRef(null);
  const cyContainerRef = useRef(null);

  const getNodeSpent = (nodeId) => {
    return allExpenses
      .filter(e => e.node_id === nodeId)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
  };

  const getTotalSpent = () => {
    return allExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  };

  const initializeBudget = async (amount) => {
    try {
      const { data: budget, error: budgetError } = await supabase
        .from('budgets')
        .insert({ total_amount: amount })
        .select()
        .single();

      if (budgetError) throw budgetError;

      setBudgetId(budget.id);

      const defaultNodes = [
        { name: 'Investment', percentage: 20 },
        { name: 'Wants', percentage: 30 },
        { name: 'Needs', percentage: 50 }
      ];

      const nodesToInsert = defaultNodes.map(node => ({
        budget_id: budget.id,
        name: node.name,
        percentage: node.percentage,
        allocated_amount: (amount * node.percentage) / 100
      }));

      const { data: createdNodes, error: nodesError } = await supabase
        .from('budget_nodes')
        .insert(nodesToInsert)
        .select();

      if (nodesError) throw nodesError;

      setNodes(createdNodes);
      setShowWelcome(false);
      
      setTimeout(() => initCytoscape(createdNodes), 100);
    } catch (error) {
      console.error('Error initializing budget:', error);
      alert('Failed to initialize budget. Please try again.');
    }
  };

  const initCytoscape = (nodeData) => {
    if (!cyContainerRef.current || cyRef.current) return;

    const elements = [
      { 
        data: { 
          id: 'total', 
          label: `Total\n₹${parseFloat(totalAmount).toFixed(2)}`,
          type: 'total'
        } 
      },
      ...nodeData.map(node => ({
        data: {
          id: node.id,
          label: `${node.name}\n${node.percentage}%\n₹${parseFloat(node.allocated_amount).toFixed(2)}`,
          percentage: node.percentage,
          type: 'budget'
        }
      })),
      ...nodeData.map(node => ({
        data: {
          source: 'total',
          target: node.id,
          weight: node.percentage
        }
      }))
    ];

    cyRef.current = cytoscape({
      container: cyContainerRef.current,
      elements: elements,
      style: [
        {
          selector: 'node[type="total"]',
          style: {
            'background-color': '#6366f1',
            'label': 'data(label)',
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'width': 120,
            'height': 120,
            'font-size': '14px',
            'text-wrap': 'wrap',
            'text-max-width': 100,
            'font-weight': 'bold',
            'border-width': 3,
            'border-color': '#4f46e5'
          }
        },
        {
          selector: 'node[type="budget"]',
          style: {
            'background-color': '#10b981',
            'label': 'data(label)',
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'width': 100,
            'height': 100,
            'font-size': '12px',
            'text-wrap': 'wrap',
            'text-max-width': 90,
            'border-width': 2,
            'border-color': '#059669'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#f59e0b',
            'border-width': 4
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 'mapData(weight, 0, 100, 2, 8)',
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'opacity': 0.6
          }
        }
      ],
      layout: {
        name: 'circle',
        radius: 200,
        avoidOverlap: true
      }
    });

    cyRef.current.on('tap', 'node[type="budget"]', (evt) => {
      const node = evt.target;
      const nodeId = node.id();
      const selectedNodeData = nodeData.find(n => n.id === nodeId);
      setSelectedNode(selectedNodeData);
    });
  };

  const loadAllExpenses = async () => {
    if (!budgetId || nodes.length === 0) return;
    
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .in('node_id', nodes.map(n => n.id))
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAllExpenses(data || []);
    } catch (error) {
      console.error('Error loading expenses:', error);
    }
  };

  const addExpense = async (e) => {
    e.preventDefault();
    if (!selectedNode || !newExpense.itemName || !newExpense.amount) {
      alert('Please fill in item name and amount');
      return;
    }

    const amount = parseFloat(newExpense.amount);
    const currentSpent = getNodeSpent(selectedNode.id);
    
    if (currentSpent + amount > parseFloat(selectedNode.allocated_amount)) {
      const confirm = window.confirm(
        `This expense will exceed your budget for ${selectedNode.name}. Do you want to continue?`
      );
      if (!confirm) return;
    }

    try {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          node_id: selectedNode.id,
          item_name: newExpense.itemName,
          amount: amount,
          note: newExpense.note || null
        })
        .select()
        .single();

      if (error) throw error;

      setAllExpenses([data, ...allExpenses]);
      setNewExpense({ itemName: '', amount: '', note: '' });
    } catch (error) {
      console.error('Error adding expense:', error);
      alert('Failed to add expense. Please try again.');
    }
  };

  const deleteExpense = async (expenseId) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId);

      if (error) throw error;

      setAllExpenses(allExpenses.filter(e => e.id !== expenseId));
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Failed to delete expense. Please try again.');
    }
  };

  const enterEditMode = () => {
    setEditMode(true);
    setEditingNodes(nodes.map(n => ({ ...n })));
  };

  const cancelEditMode = () => {
    setEditMode(false);
    setEditingNodes([]);
  };

  const updateEditingNode = (index, field, value) => {
    const updated = [...editingNodes];
    updated[index][field] = value;
    setEditingNodes(updated);
  };

  const addEditingNode = () => {
    setEditingNodes([...editingNodes, { 
      name: 'New Category', 
      percentage: 0, 
      allocated_amount: 0,
      isNew: true 
    }]);
  };

  const removeEditingNode = (index) => {
    const updated = editingNodes.filter((_, i) => i !== index);
    setEditingNodes(updated);
  };

  const saveEditedNodes = async () => {
    const totalPercentage = editingNodes.reduce((sum, n) => sum + parseFloat(n.percentage || 0), 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      alert('Total percentage must equal 100%');
      return;
    }

    if (editingNodes.some(n => !n.name.trim())) {
      alert('All nodes must have a name');
      return;
    }

    try {
      const { error: deleteError } = await supabase
        .from('budget_nodes')
        .delete()
        .eq('budget_id', budgetId);

      if (deleteError) throw deleteError;

      const nodesToInsert = editingNodes.map(node => ({
        budget_id: budgetId,
        name: node.name,
        percentage: parseFloat(node.percentage),
        allocated_amount: (parseFloat(totalAmount) * parseFloat(node.percentage)) / 100
      }));

      const { data: newNodes, error: insertError } = await supabase
        .from('budget_nodes')
        .insert(nodesToInsert)
        .select();

      if (insertError) throw insertError;

      setNodes(newNodes);
      setEditMode(false);
      setSelectedNode(null);
      
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      setTimeout(() => initCytoscape(newNodes), 100);
    } catch (error) {
      console.error('Error saving nodes:', error);
      alert('Failed to save changes. Please try again.');
    }
  };

  useEffect(() => {
    loadAllExpenses();
  }, [budgetId, nodes]);

  if (showWelcome) {
    return (
      <div style={styles.welcomeContainer}>
        <div style={styles.welcomeBox}>
          <h1 style={{ color: "white" }}>Welcome to NodeBudget</h1>
          <p style={{ color: "white" }}>Enter your total available amount to get started</p>

          <div>
            <div style={styles.inputGroup}>
              <span style={styles.currencySymbol}>₹</span>
              <input
                type="number"
                step="0.01"
                placeholder="10000"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                style={styles.amountInput}
              />
            </div>
            <button 
              onClick={() => {
                const amount = parseFloat(totalAmount);
                if (amount > 0) {
                  initializeBudget(amount);
                } else {
                  alert('Please enter a valid amount');
                }
              }}
              style={styles.startButton}
            >
              Start Budgeting
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalSpent = getTotalSpent();
  const totalBudget = parseFloat(totalAmount);
  const totalRemaining = totalBudget - totalSpent;
  const totalProgress = (totalSpent / totalBudget) * 100;

  const selectedNodeSpent = selectedNode ? getNodeSpent(selectedNode.id) : 0;
  const selectedNodeBudget = selectedNode ? parseFloat(selectedNode.allocated_amount) : 0;
  const selectedNodeRemaining = selectedNodeBudget - selectedNodeSpent;
  const selectedNodeProgress = selectedNodeBudget > 0 ? (selectedNodeSpent / selectedNodeBudget) * 100 : 0;

  const selectedNodeExpenses = selectedNode ? allExpenses.filter(e => e.node_id === selectedNode.id) : [];

  return (
    <div style={styles.container}>
      <div style={styles.leftPanel}>
        <div style={styles.panelHeader}>
          <h2>Budget Progress</h2>
        </div>
        
        <div style={styles.progressSection}>
          <h3>Total Budget</h3>
          <div style={styles.progressInfo}>
            <span>₹{totalSpent.toFixed(2)} / ₹{totalBudget.toFixed(2)}</span>
            <span style={totalRemaining >= 0 ? styles.positive : styles.negative}>
              ₹{totalRemaining.toFixed(2)} remaining
            </span>
          </div>
          <div style={styles.progressBar}>
            <div 
              style={{ 
                ...styles.progressFill,
                width: `${Math.min(totalProgress, 100)}%`,
                backgroundColor: totalProgress > 100 ? '#ef4444' : '#10b981'
              }}
            />
          </div>
        </div>

        {selectedNode && (
          <div style={styles.progressSection}>
            <h3>{selectedNode.name}</h3>
            <div style={styles.progressInfo}>
              <span>₹{selectedNodeSpent.toFixed(2)} / ₹{selectedNodeBudget.toFixed(2)}</span>
              <span style={selectedNodeRemaining >= 0 ? styles.positive : styles.negative}>
                ₹{selectedNodeRemaining.toFixed(2)} remaining
              </span>
            </div>
            <div style={styles.progressBar}>
              <div 
                style={{ 
                  ...styles.progressFill,
                  width: `${Math.min(selectedNodeProgress, 100)}%`,
                  backgroundColor: selectedNodeProgress > 100 ? '#ef4444' : '#3b82f6'
                }}
              />
            </div>
          </div>
        )}

        <div style={styles.categoriesList}>
          <h3>All Categories</h3>
          {nodes.map(node => {
            const spent = getNodeSpent(node.id);
            const budget = parseFloat(node.allocated_amount);
            return (
              <div 
                key={node.id} 
                style={{
                  ...styles.categoryItem,
                  ...(selectedNode?.id === node.id ? styles.active : {})
                }}
                onClick={() => setSelectedNode(node)}
              >
                <div style={styles.categoryName}>{node.name}</div>
                <div style={styles.categoryAmount}>
                  ₹{spent.toFixed(2)} / ₹{budget.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={styles.centerPanel}>
        <div style={styles.panelHeader}>
          <h2>Budget Visualization</h2>
          <button 
            onClick={enterEditMode}
            style={styles.editButton}
          >
            Edit Categories
          </button>
        </div>
        
        <div ref={cyContainerRef} style={styles.cytoscape} />
      </div>

      <div style={styles.rightPanel}>
        <div style={styles.panelHeader}>
          <h2>Expense Tracker</h2>
        </div>
        
        {selectedNode ? (
          <>
            <div style={styles.expenseForm}>
              <h3>Add Expense to {selectedNode.name}</h3>
              <div>
                <input
                  type="text"
                  placeholder="Item name"
                  value={newExpense.itemName}
                  onChange={(e) => setNewExpense({...newExpense, itemName: e.target.value})}
                  style={styles.input}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount (₹)"
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                  style={styles.input}
                />
                <textarea
                  placeholder="Note (optional)"
                  value={newExpense.note}
                  onChange={(e) => setNewExpense({...newExpense, note: e.target.value})}
                  style={styles.textarea}
                  rows={2}
                />
                <button 
                  onClick={addExpense}
                  style={styles.addExpenseButton}
                >
                  Add Expense
                </button>
              </div>
            </div>

            <div style={styles.expensesList}>
              <h3>Expenses ({selectedNodeExpenses.length})</h3>
              {selectedNodeExpenses.map(expense => (
                <div key={expense.id} style={styles.expenseItem}>
                  <div style={styles.expenseHeader}>
                    <strong>{expense.item_name}</strong>
                    <span style={styles.expenseAmount}>₹{parseFloat(expense.amount).toFixed(2)}</span>
                  </div>
                  {expense.note && (
                    <p style={styles.expenseNote}>{expense.note}</p>
                  )}
                  <div style={styles.expenseFooter}>
                    <span style={styles.expenseDate}>
                      {new Date(expense.created_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => deleteExpense(expense.id)}
                      style={styles.deleteExpenseButton}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {selectedNodeExpenses.length === 0 && (
                <p style={styles.emptyState}>No expenses yet. Add your first expense above!</p>
              )}
            </div>
          </>
        ) : (
          <div style={styles.emptyState}>
            <p>Select a budget category from the visualization to view and add expenses</p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editMode && (
        <div style={styles.modalOverlay} onClick={cancelEditMode}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2>Edit Budget Categories</h2>
              <button onClick={cancelEditMode} style={styles.closeButton}>✕</button>
            </div>
            
            <p style={styles.editHint}>Total percentage must equal 100%</p>
            
            <div style={styles.modalBody}>
              {editingNodes.map((node, index) => (
                <div key={index} style={styles.editRow}>
                  <input
                    type="text"
                    placeholder="Category Name"
                    value={node.name}
                    onChange={(e) => updateEditingNode(index, 'name', e.target.value)}
                    style={styles.editInput}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Percentage"
                    value={node.percentage}
                    onChange={(e) => updateEditingNode(index, 'percentage', e.target.value)}
                    style={styles.editInputSmall}
                  />
                  <span style={styles.percentSymbol}>%</span>
                  <button
                    onClick={() => removeEditingNode(index)}
                    style={styles.deleteButton}
                    disabled={editingNodes.length <= 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
              
              <div style={styles.editActions}>
                <button onClick={addEditingNode} style={styles.addButton}>
                  + Add Category
                </button>
                <div style={styles.totalPercentage}>
                  Total: {editingNodes.reduce((sum, n) => sum + parseFloat(n.percentage || 0), 0).toFixed(2)}%
                </div>
              </div>
            </div>
            
            <div style={styles.modalFooter}>
              <button onClick={cancelEditMode} style={styles.cancelButton}>
                Cancel
              </button>
              <button onClick={saveEditedNodes} style={styles.saveButton}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#0f172a', color: '#fff' },
  leftPanel: { width: '25%', padding: '20px', overflowY: 'auto', borderRight: '1px solid #334155' },
  centerPanel: { width: '50%', padding: '20px', display: 'flex', flexDirection: 'column' },
  rightPanel: { width: '25%', padding: '20px', overflowY: 'auto', borderLeft: '1px solid #334155' },
  panelHeader: { marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  progressSection: { marginBottom: '30px', padding: '15px', backgroundColor: '#1e293b', borderRadius: '8px' },
  progressInfo: { display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' },
  positive: { color: '#10b981' },
  negative: { color: '#ef4444' },
  progressBar: { height: '12px', backgroundColor: '#334155', borderRadius: '6px', overflow: 'hidden' },
  progressFill: { height: '100%', transition: 'width 0.3s ease' },
  categoriesList: { marginTop: '20px' },
  categoryItem: { padding: '12px', marginBottom: '8px', backgroundColor: '#1e293b', borderRadius: '6px', cursor: 'pointer', transition: 'background-color 0.2s' },
  active: { backgroundColor: '#334155', borderLeft: '3px solid #3b82f6' },
  categoryName: { fontWeight: 'bold', marginBottom: '4px' },
  categoryAmount: { fontSize: '13px', color: '#94a3b8' },
  cytoscape: { flex: 1, backgroundColor: '#1e293b', borderRadius: '8px' },
  editButton: { padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  expenseForm: { marginBottom: '30px', padding: '20px', backgroundColor: '#1e293b', borderRadius: '8px' },
  input: { width: '100%', padding: '10px', marginBottom: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff' },
  textarea: { width: '100%', padding: '10px', marginBottom: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff', resize: 'vertical' },
  addExpenseButton: { width: '100%', padding: '12px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  expensesList: { overflowY: 'auto' },
  expenseItem: { padding: '15px', marginBottom: '12px', backgroundColor: '#1e293b', borderRadius: '8px' },
  expenseHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' },
  expenseAmount: { color: '#10b981', fontWeight: 'bold' },
  expenseNote: { color: '#94a3b8', fontSize: '13px', margin: '8px 0' },
  expenseFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' },
  expenseDate: { fontSize: '12px', color: '#64748b' },
  deleteExpenseButton: { padding: '6px 12px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  emptyState: { textAlign: 'center', color: '#64748b', padding: '40px 20px' },
  welcomeContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0f172a' },
  welcomeBox: { padding: '40px', backgroundColor: '#1e293b', borderRadius: '12px', textAlign: 'center', maxWidth: '400px' },
  inputGroup: { position: 'relative', marginTop: '20px', marginBottom: '20px' },
  currencySymbol: { position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '18px' },
  amountInput: { width: '100%', padding: '15px 15px 15px 40px', fontSize: '18px', backgroundColor: '#0f172a', border: '2px solid #334155', borderRadius: '8px', color: '#fff' },
  startButton: { width: '100%', padding: '15px', fontSize: '16px', fontWeight: 'bold', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  
  // Modal styles
  modalOverlay: { 
    position: 'fixed', 
    top: 0, 
    left: 0, 
    right: 0, 
    bottom: 0, 
    backgroundColor: 'rgba(0, 0, 0, 0.75)', 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    zIndex: 1000 
  },
  modalContent: { 
    backgroundColor: '#1e293b', 
    borderRadius: '12px', 
    width: '90%', 
    maxWidth: '600px', 
    maxHeight: '80vh', 
    display: 'flex', 
    flexDirection: 'column',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  },
  modalHeader: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: '20px 24px', 
    borderBottom: '1px solid #334155' 
  },
  closeButton: { 
    background: 'none', 
    border: 'none', 
    color: '#94a3b8', 
    fontSize: '24px', 
    cursor: 'pointer', 
    padding: '0', 
    width: '32px', 
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    transition: 'all 0.2s'
  },
  modalBody: { 
    padding: '24px', 
    overflowY: 'auto', 
    flex: 1 
  },
  modalFooter: { 
    display: 'flex', 
    gap: '12px', 
    padding: '20px 24px', 
    borderTop: '1px solid #334155' 
  },
  editHint: { color: '#94a3b8', marginBottom: '20px', fontSize: '14px' },
  editRow: { display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' },
  editInput: { flex: 1, padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff' },
  editInputSmall: { width: '80px', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#fff' },
  percentSymbol: { color: '#94a3b8' },
  deleteButton: { padding: '8px 12px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  editActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #334155' },
  addButton: { padding: '10px 20px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  totalPercentage: { fontWeight: 'bold', fontSize: '16px' },
  cancelButton: { flex: 1, padding: '12px', backgroundColor: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  saveButton: { flex: 1, padding: '12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }
};