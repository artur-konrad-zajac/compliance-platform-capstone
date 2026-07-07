import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext, getCaseProgress } from '../context/AppContext';
import { QuestionChat } from './QuestionChat';
import { checkIsVisible, getTabs, getQuestions } from '../utils/expressionParser';
import { motion, AnimatePresence } from 'framer-motion';
import { getStatusBadgeClass } from '../utils/styleUtils';
import { Check, X, FileText, ArrowLeft, Download, Sparkles, AlertTriangle } from 'lucide-react';
import { getInstanceId } from '../utils/instanceId';
import { formatDateYMD } from '../utils/dateUtils';

export const downloadBase64File = (dataUrl: string, filename: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const ReviewValidationPanel: React.FC = () => {
  const { role, config, configHistory, cases, updateCaseStatus, setValidation, addChatMessage, updateChatMessage, deleteChatMessage, markChatRead, setAiEvaluation } = useAppContext();
  
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('general');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Default-select the first tab when a case is opened
  useEffect(() => {
    if (selectedCaseId) {
      const activeCase = cases[selectedCaseId];
      if (activeCase) {
        const cConfig = configHistory?.[activeCase.configVersion || 1] || config;
        if (cConfig?.tabs?.length > 0) {
          setActiveTab(cConfig.tabs[0].id);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCaseId]);

  const activeCase = selectedCaseId ? cases[selectedCaseId] : null;
  const activeCaseVersion = activeCase?.configVersion || 1;
  const activeConfig = (configHistory && configHistory[activeCaseVersion]) ? configHistory[activeCaseVersion] : config;

  const handleAIEvaluate = async () => {
    if (!activeCase) return;
    setIsEvaluating(true);
    try {
      const response = await fetch((import.meta.env.VITE_API_URL) + "/api/evaluate-form", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Instance-Id": getInstanceId() },
        body: JSON.stringify({
          form_data: activeCase.answers,
          form_config: activeConfig
        })
      });
      const data = await response.json();
      if (data.status === 'success' && data.evaluation_report) {
        const report = data.evaluation_report;
        if (report.general_comment) {
          addChatMessage(activeCase.id, 'general', report.general_comment, { role: 'validator', isAI: true, isDraft: true });
        }
        if (report.question_actions && Array.isArray(report.question_actions)) {
          report.question_actions.forEach((qa: any) => {
            if (qa.customer_comment) {
              addChatMessage(activeCase.id, qa.id, qa.customer_comment, { role: 'validator', isAI: true, isDraft: true });
            }
            if (qa.recommendation || qa.explanation) {
              setAiEvaluation(activeCase.id, qa.id, qa.recommendation || '', qa.explanation || '');
            }
          });
        }
        alert("AI Evaluation complete! Recommendations and comments have been drafted in the chat for your final review.");
      } else {
        alert("Failed to evaluate: " + (data.message || "Unknown error"));
      }
    } catch (e: any) {
      alert("Error contacting Swarm Agents: " + e.message);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Clear selected case when switching roles
  React.useEffect(() => {
    setSelectedCaseId(null);
  }, [role]);

  const handleCompletePhase = () => {
    if (!activeCase) return;
    
    const activeCaseVersion = activeCase.configVersion || 1;
    const activeConfig = (configHistory && configHistory[activeCaseVersion]) ? configHistory[activeCaseVersion] : config;
    const { totalApplicable, totalValidatedEvaluated } = getCaseProgress(activeCase, activeConfig);

    const errors: string[] = [];

    getTabs(activeConfig).forEach((tab: any) => {
      getQuestions(tab).forEach((q: any) => {
        const isVisible = checkIsVisible(q, activeCase.answers);
        if (isVisible) {
          if (!activeCase.validations[q.id]) {
            errors.push(q.id);
          }
        }
      });
    });

    if (totalValidatedEvaluated < totalApplicable) {
      setValidationErrors(errors);
      const firstTabWithError = getTabs(activeConfig).find((tab: any) => getQuestions(tab).some((q: any) => errors.includes(q.id)));
      if (firstTabWithError) setActiveTab(firstTabWithError.id);
      return;
    }
    
    let hasRejection = false;
    Object.values(activeCase.validations).forEach(status => {
      if (status === 'rejected') hasRejection = true;
    });
    
    if (hasRejection) {
      updateCaseStatus(activeCase.id, 'needs_revision');
    } else {
      updateCaseStatus(activeCase.id, 'concluded');
    }
    
    setValidationErrors([]);
    setSelectedCaseId(null);
  };

  const pendingCases = Object.values(cases).filter(c => 
    ['draft', 'needs_revision', 'submitted', 'in_review', 'reviewed', 'validated'].includes(c.status)
  ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  
  const completedCases = Object.values(cases).filter(c => 
    ['concluded', 'validated', 'rejected'].includes(c.status)
  ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // DASHBOARD VIEW
  if (!activeCase) {
    return (
      <div className="space-y-8 pb-20">
        <div className="saas-card rounded-2xl p-6 md:p-8 border-l-4 border-l-indigo-500">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Compliance Validation Dashboard
          </h2>
          <p className="text-gray-600 dark:text-gray-300">
            Select a compliance case from the list below to evaluate.
          </p>
        </div>

        <div className="saas-card rounded-2xl overflow-x-hidden md:overflow-x-auto p-4 md:p-0 border border-primary-200 dark:border-primary-800">
          <table className="block md:table w-full text-left border-collapse">
            <thead className="hidden md:table-header-group">
              <tr className="bg-slate-100/50 dark:bg-[#1C1C1E]/50 border-b border-gray-200 dark:border-[#27272A]">
                <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Case ID</th>
                <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Applicant</th>
                <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-center">Status</th>
                <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Version</th>
                <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Progress</th>
                <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Evaluation</th>
                <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Submitted</th>
                <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Updated</th>
                <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {pendingCases.length === 0 ? (
                <tr className="block md:table-row">
                  <td colSpan={9} className="p-8 text-center text-gray-500 block md:table-cell">
                    No pending cases to validate.
                  </td>
                </tr>
              ) : (
                pendingCases.map(c => {
                  const cConfig = configHistory?.[c.configVersion || 1] || config;
                  const { totalApplicable, totalAnswered, totalValidated, totalValidatedRejected } = getCaseProgress(c, cConfig);
                  return (
                  <tr key={c.id} className="block md:table-row bg-slate-50 dark:bg-[#0A0A0B] md:bg-transparent md:border-b border-gray-200 dark:border-[#27272A] hover:bg-slate-100/80 dark:hover:bg-[#1C1C1E]/30 transition-colors mb-4 md:mb-0 rounded-xl md:rounded-none border shadow-sm md:shadow-none overflow-hidden">
                    <td className="p-4 text-sm font-mono text-gray-500 dark:text-gray-400 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                      <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Case ID</span>
                      <span>{c.id}</span>
                    </td>
                    <td className="p-4 font-medium text-gray-800 dark:text-gray-200 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none whitespace-nowrap">
                      <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Applicant</span>
                      <div className="flex flex-col items-start gap-1">
                        <span>{c.customerName}</span>
                        {Object.entries(c.unreadByStaff || {}).some(([k, v]) => {
                          if (!v) return false;
                          if (k === 'status_validator') return true;
                          return false;
                        }) && (
                          <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full animate-pulse uppercase whitespace-nowrap">
                            New Msg
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none text-center">
                      <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Status</span>
                      <span className={`inline-block align-middle px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusBadgeClass(c.status)}`}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                      <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Version</span>
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        v{c.configVersion || 1}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-600 dark:text-gray-300 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                      <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Progress</span>
                      <span className="whitespace-nowrap">Answered: {totalAnswered} / {totalApplicable}</span>
                    </td>
                    <td className="p-4 text-sm text-gray-600 dark:text-gray-300 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                      <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Evaluation</span>
                      <div className="flex flex-col space-y-1 text-xs text-right md:text-left">
                        <span className="flex items-center justify-end md:justify-start space-x-1">
                          <span className="w-8 font-medium">Eval:</span> 
                          <span className="text-green-600 dark:text-green-400 font-semibold">{totalValidated}✓</span> 
                          <span className="text-red-500 font-semibold">{totalValidatedRejected}✗</span>
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-xs text-gray-500 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                      <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Submitted</span>
                      <span>{formatDateYMD(new Date())}</span>
                    </td>
                    <td className="p-4 text-xs text-gray-500 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                      <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Updated</span>
                      <span>{formatDateYMD(new Date())}</span>
                    </td>
                    <td className="p-4 text-right flex gap-4 justify-between items-center md:table-cell bg-[#F3F4F6] dark:bg-[#1C1C1E]/50 md:bg-transparent dark:md:bg-transparent">
                      <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Action</span>
                      <button 
                        onClick={() => { 
                          setSelectedCaseId(c.id); 
                          setActiveTab('general'); 
                          markChatRead(c.id, 'status_validator');
                        }}
                        className="w-full md:w-36 text-center whitespace-nowrap px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Open Case
                      </button>
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>

        {completedCases.length > 0 && (
          <div className="mt-12">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 border-b border-gray-200 dark:border-[#27272A] pb-2">
              Completed Cases History
            </h3>
            <div className="saas-card rounded-2xl overflow-x-hidden md:overflow-x-auto p-4 md:p-0">
              <table className="block md:table w-full text-left border-collapse opacity-80">
                <thead className="hidden md:table-header-group">
                  <tr className="bg-slate-100/50 dark:bg-[#1C1C1E]/50 border-b border-gray-200 dark:border-[#27272A]">
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Case ID</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Applicant</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-center">Status</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Version</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Progress</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Evaluation</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Submitted</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300">Updated</th>
                    <th className="p-4 font-semibold text-gray-600 dark:text-gray-300 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="block md:table-row-group">
                  {completedCases.map(c => {
                    const cConfig = configHistory?.[c.configVersion || 1] || config;
                    const { totalApplicable, totalAnswered, totalValidated, totalValidatedRejected } = getCaseProgress(c, cConfig);
                    return (
                    <tr key={c.id} className="block md:table-row bg-slate-50 dark:bg-[#0A0A0B] md:bg-transparent md:border-b border-gray-200 dark:border-[#27272A] hover:bg-slate-100/80 dark:hover:bg-[#1C1C1E]/30 transition-colors mb-4 md:mb-0 rounded-xl md:rounded-none border shadow-sm md:shadow-none overflow-hidden">
                      <td className="p-4 text-sm font-mono text-gray-500 dark:text-gray-400 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Case ID</span>
                        <span>{c.id}</span>
                      </td>
                      <td className="p-4 font-medium text-gray-800 dark:text-gray-200 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none whitespace-nowrap">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Applicant</span>
                        {c.customerName}
                      </td>
                      <td className="p-4 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none text-center">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Status</span>
                        <span className={`inline-block align-middle px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusBadgeClass(c.status)}`}>
                          {c.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-4 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Version</span>
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          v{c.configVersion || 1}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-600 dark:text-gray-300 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Progress</span>
                        <span className="whitespace-nowrap">Answered: {totalAnswered} / {totalApplicable}</span>
                      </td>
                      <td className="p-4 text-sm text-gray-600 dark:text-gray-300 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Evaluation</span>
                        <div className="flex flex-col space-y-1 text-xs text-right md:text-left">
                          <span className="flex items-center justify-end md:justify-start space-x-1">
                            <span className="w-8 font-medium">Eval:</span> 
                            <span className="text-green-600 dark:text-green-400 font-semibold">{totalValidated}✓</span> 
                            <span className="text-red-500 font-semibold">{totalValidatedRejected}✗</span>
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-xs text-gray-500 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Submitted</span>
                        <span>{formatDateYMD(new Date())}</span>
                      </td>
                      <td className="p-4 text-xs text-gray-500 flex justify-between items-center md:table-cell border-b border-slate-100 dark:border-[#27272A] md:border-none">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Updated</span>
                        <span>{formatDateYMD(new Date())}</span>
                      </td>
                      <td className="p-4 text-right flex gap-4 justify-between items-center md:table-cell bg-[#F3F4F6] dark:bg-[#1C1C1E]/50 md:bg-transparent dark:md:bg-transparent">
                        <span className="md:hidden font-bold text-xs text-gray-500 uppercase">Action</span>
                        <button 
                          onClick={() => { 
                            setSelectedCaseId(c.id); 
                            setActiveTab('general'); 
                          }}
                          className="w-full md:w-36 text-center whitespace-nowrap px-4 py-2 bg-slate-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                        >
                          View History
                        </button>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // DETAIL VIEW
  const activeTabConfig = getTabs(activeConfig).find((t: any) => t.id === activeTab);
  const isReadOnly = activeCase.status === 'concluded';
  const canModifyEvaluation = !isReadOnly;
  const canCompletePhase = canModifyEvaluation;
  const visibleQuestions = activeTabConfig?.questions.filter((q: any) => checkIsVisible(q, activeCase.answers)) || [];

  return (
    <div className="space-y-8 pb-20">
      <div className="saas-card rounded-2xl p-6 md:p-8 border-l-4 border-l-indigo-500 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <button 
            onClick={() => setSelectedCaseId(null)}
            className="flex items-center space-x-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Reviewing Application: {activeCase.customerName}
          </h2>
        </div>
        <div className="flex w-full md:w-auto items-center space-x-3 mt-4 md:mt-0">
          <button 
            onClick={handleAIEvaluate}
            disabled={isEvaluating}
            className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 ${
              isEvaluating 
                ? 'bg-slate-200 dark:bg-slate-700 text-gray-500 cursor-not-allowed opacity-50' 
                : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-md shadow-violet-500/20 border-none'
            }`}
          >
            <span>{isEvaluating ? 'Evaluating...' : 'AI Evaluate'}</span>
          </button>
          {canCompletePhase && (
            <button 
              onClick={handleCompletePhase}
              className="flex-1 md:flex-none px-6 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-500 transition-colors font-medium shadow-sm shadow-primary-600/20 flex items-center justify-center space-x-2 cursor-pointer"
            >
              <span>Conclude</span>
            </button>
          )}
        </div>
      </div>

      <div className="saas-card rounded-2xl p-6 border border-gray-200 dark:border-[#27272A]">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">General Case Discussion</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Communicate with the applicant regarding the overall application.</p>
        <QuestionChat 
          title="General Discussion"
          messages={activeCase.chats?.['general'] || []}
          onSend={(text) => addChatMessage(activeCase.id, 'general', text)} 
          onUpdateDraft={(messageId, text, isDraft) => updateChatMessage(activeCase.id, 'general', messageId, text, isDraft)}
          onDeleteDraft={(messageId) => deleteChatMessage(activeCase.id, 'general', messageId)}
          isReadOnly={isReadOnly}
          hasUnread={activeCase.unreadByStaff?.['general'] || false}
          onOpen={() => markChatRead(activeCase.id, 'general')}
        />
      </div>

      <div className="w-full">
        {/* Question Review List */}
        <div className="w-full space-y-6">
          {(() => {

            const renderQuestionBlock = (q: any, isLastInGroup: boolean) => {
              const answer = activeCase.answers[q.id];
              const validationStatus = activeCase.validations[q.id];

              const renderAnswer = (question: any, ans: any) => {
                const hasVal = ans !== undefined && ans !== null && ans !== '' && (!Array.isArray(ans) || ans.length > 0);
                if (!hasVal) return <span className="italic text-gray-400">No answer provided</span>;
                
                if (question.type === 'checkbox') return Array.isArray(ans) ? ans.join(', ') : String(ans);
                if (question.type === 'file') {
                  const fileList = Array.isArray(ans) ? ans : [ans];
                  return (
                    <div className="space-y-2">
                      {fileList.map((fileObj: any, idx: number) => {
                        const isLegacyStr = typeof fileObj === 'string';
                        const fName = isLegacyStr ? fileObj : fileObj.name;
                        const fDataUrl = isLegacyStr ? null : fileObj.dataUrl;
                        
                        return (
                          <div key={idx} className="flex items-center space-x-4 bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-[#27272A] p-2 px-3 rounded-lg w-fit">
                            <div className="flex items-center space-x-2 text-primary-600 dark:text-primary-400">
                              <FileText className="w-4 h-4" /> 
                              <span className="font-medium text-sm">{fName}</span>
                            </div>
                            {fDataUrl && (
                              <button 
                                onClick={() => downloadBase64File(fDataUrl, fName)}
                                className="flex items-center space-x-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium transition-colors"
                              >
                                <Download className="w-3 h-3" /> <span>Download</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                if (question.type === 'dynamic-list') {
                  if (!Array.isArray(ans)) return null;
                  return (
                    <div className="space-y-2">
                      {ans.map((item: any, idx: number) => (
                        <div key={idx} className="bg-white dark:bg-[#1C1C1E] p-3 rounded-lg border border-gray-200 dark:border-[#27272A]">
                          {question.subFields?.map((subQ: any) => (
                            <div key={subQ.id} className="flex flex-col mb-2 last:mb-0 text-sm">
                              <span className="font-semibold text-gray-500">{subQ.text}:</span>
                              <span className="text-gray-800 dark:text-gray-200">{renderAnswer(subQ, item[subQ.id])}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                }
                return String(ans);
              };

              const isInvalid = validationErrors.includes(q.id);

              return (
                <div key={q.id} className={`py-6 flex flex-col gap-6 ${!isLastInGroup && !isInvalid ? 'border-b border-gray-200 dark:border-[#27272A]' : ''} ${isInvalid ? 'bg-red-50/50 dark:bg-red-900/10 px-4 -mx-4 rounded-xl border-2 border-red-300 dark:border-red-800 my-2 shadow-sm shadow-red-500/10' : ''}`}>
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <p className="text-lg font-medium text-gray-900 dark:text-slate-100">
                          {q.text}
                        </p>
                        {activeCase.changedAnswers?.[q.id] && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded text-xs font-bold uppercase tracking-wider border border-amber-200 dark:border-amber-800">
                            Changed by Applicant
                          </span>
                        )}
                      </div>
                      
                      <div className="bg-[#F3F4F6] dark:bg-[#0A0A0B]/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                        <h4 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Applicant Answer</h4>
                        <div className="text-gray-800 dark:text-gray-200 font-medium">
                          {renderAnswer(q, answer)}
                        </div>
                      </div>
                      
                      {activeCase.aiRecommendations?.[q.id] && (
                        <div className="mt-3 text-sm flex flex-col space-y-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-violet-650 dark:text-violet-400 font-semibold flex items-center gap-1 text-xs uppercase tracking-wider">
                              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                              AI Recommendation:
                            </span>
                            <span className={`font-semibold px-2 py-0.5 rounded text-xs uppercase tracking-wider ${activeCase.aiRecommendations[q.id].toLowerCase() === 'approve' ? 'bg-violet-100 text-violet-750 dark:bg-violet-900/30 dark:text-violet-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                              {activeCase.aiRecommendations[q.id]}
                            </span>
                          </div>
                          {activeCase.aiExplanations?.[q.id] && (
                            <div className="text-sm text-gray-600 dark:text-gray-300 bg-violet-50/50 dark:bg-violet-950/20 p-3 rounded-lg border border-violet-100 dark:border-violet-800/30">
                              <span className="font-semibold text-violet-700 dark:text-violet-400 block mb-1 text-xs uppercase tracking-wider">AI Explanation:</span>
                              <div>{activeCase.aiExplanations[q.id]}</div>
                              <div className="mt-2 pt-2 border-t border-violet-200/50 dark:border-violet-800/50 text-[10px] text-violet-700 dark:text-violet-400 italic">
                                Disclaimer: This is an AI-generated response. It may contain inaccuracies.
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {!canModifyEvaluation && validationStatus && (
                        <div className="mt-3 text-sm flex items-center space-x-2">
                          <span className="text-gray-500">Your Evaluation: </span>
                          <span className={`font-semibold px-2 py-0.5 rounded text-xs uppercase tracking-wider ${validationStatus === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                            {validationStatus}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col space-y-4">
                      {canModifyEvaluation && (
                        <div className="flex flex-row md:flex-col space-x-3 md:space-x-0 space-y-0 md:space-y-3 w-full md:min-w-[140px] shrink-0">
                          <button
                            onClick={() => setValidation(activeCase.id, q.id, validationStatus === 'approved' ? null : 'approved')}
                            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-xl font-medium transition-all ${
                              validationStatus === 'approved'
                                ? 'bg-green-500 text-white shadow-md shadow-green-500/30'
                                : 'bg-white dark:bg-[#1C1C1E] text-green-600 dark:text-green-400 border border-gray-200 dark:border-[#27272A] hover:bg-green-50 dark:hover:bg-slate-700'
                            }`}
                          >
                            <Check className="w-4 h-4" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => setValidation(activeCase.id, q.id, validationStatus === 'rejected' ? null : 'rejected')}
                            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-xl font-medium transition-all ${
                              validationStatus === 'rejected'
                                ? 'bg-red-500 text-white shadow-md shadow-red-500/30'
                                : 'bg-white dark:bg-[#1C1C1E] text-red-600 dark:text-red-400 border border-gray-200 dark:border-[#27272A] hover:bg-red-50 dark:hover:bg-slate-700'
                            }`}
                          >
                            <X className="w-4 h-4" />
                            <span>Reject</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 w-full">
                    <QuestionChat 
                      messages={activeCase.chats?.[q.id] || []}
                      onSend={(text) => addChatMessage(activeCase.id, q.id, text)} 
                      onUpdateDraft={(messageId, text, isDraft) => updateChatMessage(activeCase.id, q.id, messageId, text, isDraft)}
                      onDeleteDraft={(messageId) => deleteChatMessage(activeCase.id, q.id, messageId)}
                      isReadOnly={isReadOnly}
                      hasUnread={activeCase.unreadByStaff?.[q.id] || false}
                      onOpen={() => markChatRead(activeCase.id, q.id)}
                    />
                  </div>
                </div>
              );
            };

            return visibleQuestions.map((q: any, index: number) => {
              return (
                <motion.div 
                  key={q.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="saas-card rounded-2xl px-6 flex flex-col border border-transparent hover:border-gray-200 dark:hover:border-[#27272A] transition-colors"
                >
                  {renderQuestionBlock(q, true)}
                </motion.div>
              );
            });
          })()}

          {visibleQuestions.length === 0 && (
            <div className="saas-card rounded-2xl p-12 text-center text-gray-500">
              No applicable questions in this tab for the applicant to answer.
            </div>
          )}
        </div>
      </div>

      {/* Forms Tab Backdrop */}
      {createPortal(
        <>
          <AnimatePresence>
            {isSidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="fixed inset-0 bg-[#0A0A0B]/60 backdrop-blur-sm z-[9998]"
              />
            )}
          </AnimatePresence>

          {/* Forms Tab Slide-out Drawer */}
          <AnimatePresence>
            {isSidebarOpen && (
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 right-0 bottom-0 w-[350px] bg-white dark:bg-[#1C1C1E] border-l border-gray-200 dark:border-[#27272A] shadow-2xl z-[9999] flex flex-col p-5"
              >
                <div className="flex items-center justify-between mb-4 shrink-0 border-b border-gray-100 dark:border-slate-800 pb-3">
                  <h3 className="font-bold text-base text-gray-800 dark:text-gray-200">Form Tabs</h3>
                </div>
                
                {/* Tab List - Scrollable */}
                <div 
                  className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-2.5 pr-1 -mr-1 mb-4"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {(getTabs(activeConfig) || []).map((tab: any) => {
                    const hasUnreadInTab = getQuestions(tab).some((q: any) => activeCase.unreadByStaff?.[q.id]);
                    const hasErrorsInTab = getQuestions(tab).some((q: any) => validationErrors.includes(q.id));
                    
                    return (
                      <button
                        key={tab.id}
                        onClick={() => { setActiveTab(activeTab === tab.id ? null : tab.id); setIsSidebarOpen(false); }}
                        className={`w-full text-left px-4 py-3 rounded-xl transition-all font-medium flex justify-between items-center ${
                          activeTab === tab.id 
                            ? 'bg-primary-600 text-white shadow-md shadow-primary-600/30' 
                            : hasErrorsInTab
                              ? 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800/50'
                              : 'bg-gray-50 dark:bg-[#0A0A0B] border border-gray-250/50 dark:border-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-855'
                        }`}
                      >
                        <span className="font-semibold break-words flex-1 mr-2 text-sm text-left">{tab.title}</span>
                        {hasErrorsInTab && (
                          <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ml-1 ${activeTab === tab.id ? 'text-white' : 'text-red-500 animate-pulse'}`} />
                        )}
                        {hasUnreadInTab && (
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ml-1 ${activeTab === tab.id ? 'bg-white' : 'bg-red-500'}`} />
                        )}
                      </button>
                    );
                  })}
                </div>
                
                {/* Bottom buttons - Pinned at the bottom of the drawer */}
                <div className="flex flex-col gap-2 pt-4 border-t border-gray-100 dark:border-slate-800 shrink-0">
                  <button 
                    onClick={() => setIsSidebarOpen(false)} 
                    className="w-full flex items-center justify-center space-x-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold shadow-md transition-colors text-sm cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>Close Sidebar</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body
      )}

      {/* Vertical tab pinned to the right edge when sidebar is closed */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className={`flex fixed right-0 top-64 md:top-1/2 md:-translate-y-1/2 z-[9990] text-white rounded-l-md py-6 px-2.5 shadow-md flex-col items-center justify-center border border-r-0 cursor-pointer select-none transition-colors ${
            validationErrors.length > 0
              ? 'bg-red-600 hover:bg-red-500 border-red-400/20 animate-pulse'
              : 'bg-primary-600 hover:bg-primary-500 border-primary-400/20'
          }`}
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          <span className="font-bold tracking-wider text-xs uppercase">Form Tabs</span>
        </button>
      )}
    </div>
  );
};



