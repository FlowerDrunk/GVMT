import type { OperationResult, VcsType } from "../../lib/api";
import { VcsLabels } from "../../lib/constants";

interface OperationPanelProps {
  operationResults: OperationResult[];
  onOpenSvnDownload: (target: "tortoise" | "sliksvn") => void;
}

export function OperationPanel({ operationResults, onOpenSvnDownload }: OperationPanelProps) {
  if (operationResults.length === 0) return null;

  return (
    <section className="panel operation-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Operation result</p>
          <h3>最近操作</h3>
        </div>
        <span className="soft-chip">更新</span>
      </div>
      <div className="operation-list">
        {operationResults.map((result) => (
          <div
            className={`operation-card ${result.success ? "success" : "failed"}`}
            key={`${result.vcsType}-${result.operation}`}
          >
            <div className="operation-heading">
              <strong>{VcsLabels[result.vcsType]}</strong>
              <span>{result.summary}</span>
            </div>
            {result.warning ? (
              <div className="operation-warning">
                <p>{result.warning}</p>
                {result.missingSvnCli ? (
                  <div className="hint-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => onOpenSvnDownload("tortoise")}
                    >
                      下载 / 修改 TortoiseSVN
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => onOpenSvnDownload("sliksvn")}
                    >
                      下载 SlikSVN
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {result.output ? <pre>{result.output}</pre> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
