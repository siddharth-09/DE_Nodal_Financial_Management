'use client';

import { useState, useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import { createClient } from '@supabase/supabase-js';
import styles from './page.module.css';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Home() {
  // State management
  const [showWelcome, setShowWelcome] = useState(true);
  const [totalAmount, setTotalAmount] = useState('');
  const [budgetId, setBudgetId] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [newExpense, setNewExpense] = useState({ itemName: '', amount: '', note: '' });
  const [editMode, setEditMode] = useState(false);
  const [editingNodes, setEditingNodes] = useState([]);
  
  const cyRef = useRef(null);
  const cyContainerRef = useRef(null);

  // Calculate total spent for a node
  const getNodeSpent = (nodeId) => {
    return expenses
      .filter(e => e.node_id === nodeId)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
  };

  // Calculate total spent overall
  const getTotalSpent = () => {
    return expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  };

  // Initialize budget with default nodes
  const initializeBudget = async (amount) => {
    try {
      // Create budget
      const { data: budget, error: budgetError } = await supabase
        .from('budgets')
        .insert({ total_amount: amount })
        .select()
        .single();

      if (budgetError) throw budgetError;

      setBudgetId(budget.id);

      // Create default nodes
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
      
      // Initialize cytoscape after nodes are set
      setTimeout(() => initCytoscape(createdNodes), 100);
    } catch (error) {
      console.error('Error initializing budget:', error);
      alert('Failed to initialize budget. Please try again.');
    }
  };

  // Initialize Cytoscape graph
  const initCytoscape = (nodeData) => {
    if (!cyContainerRef.current || cyRef.current) return;

    const elements = [
      // Central node
      { 
        data: { 
          id: 'total', 
          label: `Total\n₹${parseFloat(totalAmount).toFixed(2)}`,
          type: 'total'
        } 
      },
      // Budget nodes
      ...nodeData.map(node => ({
        data: {
          id: node.id,
          label: `${node.name}\n${node.percentage}%\n₹${parseFloat(node.allocated_amount).toFixed(2)}`,
          percentage: node.percentage,
          type: 'budget'
        }
      })),
      // Edges
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

    // Handle node selection
    cyRef.current.on('tap', 'node[type="budget"]', (evt) => {
      const node = evt.target;
      const nodeId = node.id();
      const selectedNodeData = nodeData.find(n => n.id === nodeId);
      setSelectedNode(selectedNodeData);
      loadExpenses(nodeId);
    });
  };

  // Load expenses for a node
  const loadExpenses = async (nodeId) => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('node_id', nodeId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error('Error loading expenses:', error);
    }
  };

  // Add new expense
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

      setExpenses([data, ...expenses]);
      setNewExpense({ itemName: '', amount: '', note: '' });
    } catch (error) {
      console.error('Error adding expense:', error);
      alert('Failed to add expense. Please try again.');
    }
  };

  // Delete expense
  const deleteExpense = async (expenseId) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId);

      if (error) throw error;

      setExpenses(expenses.filter(e => e.id !== expenseId));
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Failed to delete expense. Please try again.');
    }
  };

  // Enter edit mode
  const enterEditMode = () => {
    setEditMode(true);
    setEditingNodes(nodes.map(n => ({ ...n })));
  };

  // Cancel edit mode
  const cancelEditMode = () => {
    setEditMode(false);
    setEditingNodes([]);
  };

  // Update editing node
  const updateEditingNode = (index, field, value) => {
    const updated = [...editingNodes];
    updated[index][field] = value;
    setEditingNodes(updated);
  };

  // Add new node in edit mode
  const addEditingNode = () => {
    setEditingNodes([...editingNodes, { 
      name: 'New Category', 
      percentage: 0, 
      allocated_amount: 0,
      isNew: true 
    }]);
  };

  // Remove node in edit mode
  const removeEditingNode = (index) => {
    const updated = editingNodes.filter((_, i) => i !== index);
    setEditingNodes(updated);
  };

  // Save edited nodes
  const saveEditedNodes = async () => {
    // Validate total percentage
    const totalPercentage = editingNodes.reduce((sum, n) => sum + parseFloat(n.percentage || 0), 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      alert('Total percentage must equal 100%');
      return;
    }

    // Validate node names
    if (editingNodes.some(n => !n.name.trim())) {
      alert('All nodes must have a name');
      return;
    }

    try {
      // Delete old nodes
      const { error: deleteError } = await supabase
        .from('budget_nodes')
        .delete()
        .eq('budget_id', budgetId);

      if (deleteError) throw deleteError;

      // Insert new nodes
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
      
      // Reinitialize cytoscape
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

  // Load all expenses on mount
  useEffect(() => {
    if (budgetId && nodes.length > 0) {
      const loadAllExpenses = async () => {
        try {
          const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .in('node_id', nodes.map(n => n.id));

          if (error) throw error;
          setExpenses(data || []);
        } catch (error) {
          console.error('Error loading all expenses:', error);
        }
      };
      loadAllExpenses();
    }
  }, [budgetId, nodes]);

  if (showWelcome) {
    return (
      <div className={styles.welcomeContainer}>
        <div className={styles.welcomeBox}>
          <h1>Welcome to NodeBudget</h1>
          <p>Enter your total available amount to get started</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const amount = parseFloat(totalAmount);
            if (amount > 0) {
              initializeBudget(amount);
            } else {
              alert('Please enter a valid amount');
            }
          }}>
            <div className={styles.inputGroup}>
              <span className={styles.currencySymbol}>₹</span>
              <input
                type="number"
                step="0.01"
                placeholder="10000"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className={styles.amountInput}
                required
              />
            </div>
            <button type="submit" className={styles.startButton}>
              Start Budgeting
            </button>
          </form>
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

  return (
    <div className={styles.container}>
      {/* Left Panel - Progress */}
      <div className={styles.leftPanel}>
        <div className={styles.panelHeader}>
          <h2>Budget Progress</h2>
        </div>
        
        <div className={styles.progressSection}>
          <h3>Total Budget</h3>
          <div className={styles.progressInfo}>
            <span>₹{totalSpent.toFixed(2)} / ₹{totalBudget.toFixed(2)}</span>
            <span className={totalRemaining >= 0 ? styles.positive : styles.negative}>
              ₹{totalRemaining.toFixed(2)} remaining
            </span>
          </div>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill}
              style={{ 
                width: `${Math.min(totalProgress, 100)}%`,
                backgroundColor: totalProgress > 100 ? '#ef4444' : '#10b981'
              }}
            />
          </div>
        </div>

        {selectedNode && (
          <div className={styles.progressSection}>
            <h3>{selectedNode.name}</h3>
            <div className={styles.progressInfo}>
              <span>₹{selectedNodeSpent.toFixed(2)} / ₹{selectedNodeBudget.toFixed(2)}</span>
              <span className={selectedNodeRemaining >= 0 ? styles.positive : styles.negative}>
                ₹{selectedNodeRemaining.toFixed(2)} remaining
              </span>
            </div>
            <div className={styles.progressBar}>
              <div 
                className={styles.progressFill}
                style={{ 
                  width: `${Math.min(selectedNodeProgress, 100)}%`,
                  backgroundColor: selectedNodeProgress > 100 ? '#ef4444' : '#3b82f6'
                }}
              />
            </div>
          </div>
        )}

        <div className={styles.categoriesList}>
          <h3>All Categories</h3>
          {nodes.map(node => {
            const spent = getNodeSpent(node.id);
            const budget = parseFloat(node.allocated_amount);
            return (
              <div 
                key={node.id} 
                className={`${styles.categoryItem} ${selectedNode?.id === node.id ? styles.active : ''}`}
                onClick={() => {
                  setSelectedNode(node);
                  loadExpenses(node.id);
                }}
              >
                <div className={styles.categoryName}>{node.name}</div>
                <div className={styles.categoryAmount}>
                  ₹{spent.toFixed(2)} / ₹{budget.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Center Panel - Cytoscape Graph */}
      <div className={styles.centerPanel}>
        <div className={styles.panelHeader}>
          <h2>Budget Visualization</h2>
          <button 
            onClick={editMode ? cancelEditMode : enterEditMode}
            className={styles.editButton}
          >
            {editMode ? 'Cancel' : 'Edit Categories'}
          </button>
        </div>
        
        {editMode ? (
          <div className={styles.editPanel}>
            <h3>Edit Budget Categories</h3>
            <p className={styles.editHint}>Total percentage must equal 100%</p>
            
            {editingNodes.map((node, index) => (
              <div key={index} className={styles.editRow}>
                <input
                  type="text"
                  placeholder="Category Name"
                  value={node.name}
                  onChange={(e) => updateEditingNode(index, 'name', e.target.value)}
                  className={styles.editInput}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Percentage"
                  value={node.percentage}
                  onChange={(e) => updateEditingNode(index, 'percentage', e.target.value)}
                  className={styles.editInputSmall}
                />
                <span className={styles.percentSymbol}>%</span>
                <button
                  onClick={() => removeEditingNode(index)}
                  className={styles.deleteButton}
                  disabled={editingNodes.length <= 1}
                >
                  ✕
                </button>
              </div>
            ))}
            
            <div className={styles.editActions}>
              <button onClick={addEditingNode} className={styles.addButton}>
                + Add Category
              </button>
              <div className={styles.totalPercentage}>
                Total: {editingNodes.reduce((sum, n) => sum + parseFloat(n.percentage || 0), 0).toFixed(2)}%
              </div>
            </div>
            
            <button onClick={saveEditedNodes} className={styles.saveButton}>
              Save Changes
            </button>
          </div>
        ) : (
          <div ref={cyContainerRef} className={styles.cytoscape} />
        )}
      </div>

      {/* Right Panel - Expenses */}
      <div className={styles.rightPanel}>
        <div className={styles.panelHeader}>
          <h2>Expense Tracker</h2>
        </div>
        
        {selectedNode ? (
          <>
            <div className={styles.expenseForm}>
              <h3>Add Expense to {selectedNode.name}</h3>
              <form onSubmit={addExpense}>
                <input
                  type="text"
                  placeholder="Item name"
                  value={newExpense.itemName}
                  onChange={(e) => setNewExpense({...newExpense, itemName: e.target.value})}
                  className={styles.input}
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount (₹)"
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                  className={styles.input}
                  required
                />
                <textarea
                  placeholder="Note (optional)"
                  value={newExpense.note}
                  onChange={(e) => setNewExpense({...newExpense, note: e.target.value})}
                  className={styles.textarea}
                  rows={2}
                />
                <button type="submit" className={styles.addExpenseButton}>
                  Add Expense
                </button>
              </form>
            </div>

            <div className={styles.expensesList}>
              <h3>Expenses ({expenses.filter(e => e.node_id === selectedNode.id).length})</h3>
              {expenses
                .filter(e => e.node_id === selectedNode.id)
                .map(expense => (
                  <div key={expense.id} className={styles.expenseItem}>
                    <div className={styles.expenseHeader}>
                      <strong>{expense.item_name}</strong>
                      <span className={styles.expenseAmount}>₹{parseFloat(expense.amount).toFixed(2)}</span>
                    </div>
                    {expense.note && (
                      <p className={styles.expenseNote}>{expense.note}</p>
                    )}
                    <div className={styles.expenseFooter}>
                      <span className={styles.expenseDate}>
                        {new Date(expense.created_at).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => deleteExpense(expense.id)}
                        className={styles.deleteExpenseButton}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              {expenses.filter(e => e.node_id === selectedNode.id).length === 0 && (
                <p className={styles.emptyState}>No expenses yet. Add your first expense above!</p>
              )}
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <p>Select a budget category from the visualization to view and add expenses</p>
          </div>
        )}
      </div>
    </div>
  );
}