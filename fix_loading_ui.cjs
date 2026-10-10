const fs = require('fs');
let code = fs.readFileSync('src/DocuCraftTab.tsx', 'utf8');

const oldCode = `<div style={{ fontSize: '3.5rem', opacity: 0.8 }}>🎬</div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: '#f1f5f9', marginBottom: '12px', fontSize: '1.8rem' }}>DocuCraft Studio</h2>
              <p style={{ margin: '0 auto', maxWidth: '500px', lineHeight: 1.6, fontSize: '1.05rem' }}>
                Start a new documentary by configuring the settings on the left and clicking <b>Generate Script Manifest</b>.
              </p>
              <p style={{ margin: '16px auto 0', maxWidth: '500px', lineHeight: 1.6, fontSize: '1.05rem', color: '#d49547' }}>
                System crashed? Lost your work? Don't worry! Every step is automatically saved to your disk.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '20px' }}>
              {projects.length > 0 && (
                <button
                  className="docucraft-btn-primary"
                  onClick={() => handleLoadProject(projects[0])}
                  style={{ padding: '14px 28px', fontSize: '1.1rem', fontWeight: 'bold' }}
                >
                  🚀 Resume Last Project ({projects[0].title})
                </button>
              )}
              <button
                className="docucraft-btn-secondary"
                onClick={() => setActiveTab('history')}
                style={{ padding: '14px 28px', fontSize: '1.1rem' }}
              >
                📂 Open Project Archive
              </button>
            </div>`;

const newCode = `{isGeneratingScript ? (
              <>
                <div style={{ fontSize: '4rem', marginBottom: '16px', opacity: 0.8 }}>⏳</div>
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ color: '#f1f5f9', marginBottom: '12px', fontSize: '1.8rem' }}>Conceiving Documentary...</h2>
                  <p style={{ margin: '0 auto', maxWidth: '500px', lineHeight: 1.6, fontSize: '1.1rem', color: '#94a3b8' }}>
                    The AI is currently researching the topic, structuring chapters, writing the voiceover script, and planning visual shots. This may take a minute.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '3.5rem', opacity: 0.8 }}>🎬</div>
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ color: '#f1f5f9', marginBottom: '12px', fontSize: '1.8rem' }}>DocuCraft Studio</h2>
                  <p style={{ margin: '0 auto', maxWidth: '500px', lineHeight: 1.6, fontSize: '1.05rem' }}>
                    Start a new documentary by configuring the settings on the left and clicking <b>Generate Script Manifest</b>.
                  </p>
                  <p style={{ margin: '16px auto 0', maxWidth: '500px', lineHeight: 1.6, fontSize: '1.05rem', color: '#d49547' }}>
                    System crashed? Lost your work? Don't worry! Every step is automatically saved to your disk.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '16px', marginTop: '20px' }}>
                  {projects.length > 0 && (
                    <button
                      className="docucraft-btn-primary"
                      onClick={() => handleLoadProject(projects[0])}
                      style={{ padding: '14px 28px', fontSize: '1.1rem', fontWeight: 'bold' }}
                    >
                      🚀 Resume Last Project ({projects[0].title})
                    </button>
                  )}
                  <button
                    className="docucraft-btn-secondary"
                    onClick={() => setActiveTab('history')}
                    style={{ padding: '14px 28px', fontSize: '1.1rem' }}
                  >
                    📂 Open Project Archive
                  </button>
                </div>
              </>
            )}`;

if (code.includes("🚀 Resume Last Project")) {
    code = code.replace(oldCode, newCode);
    fs.writeFileSync('src/DocuCraftTab.tsx', code);
    console.log("Updated UI!");
} else {
    console.log("Could not find block");
}
