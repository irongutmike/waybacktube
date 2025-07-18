const fs = require('fs');
const path = require('path');

class FileProcessor {
    constructor() {
        this.srcDir = path.join(__dirname, '..', 'src');
        this.distDir = path.join(__dirname, '..', 'dist');
    }

    readModuleFiles() {
        const modules = [
            'config.js',
            'api-manager.js',
            'subscription-manager.js',
            'recommendation-engine.js',
            'shorts-blocker.js',
            'date-modifier.js',
            'search-interceptor.js',
            'ui-manager.js'
        ];

        const moduleContents = {};
        
        modules.forEach(moduleName => {
            const filePath = path.join(this.srcDir, moduleName);
            if (fs.existsSync(filePath)) {
                let content = fs.readFileSync(filePath, 'utf8');
                content = this.removeImportsExports(content);
                moduleContents[moduleName] = content;
                console.log(`✓ Loaded ${moduleName} (${content.length} chars)`);
            } else {
                console.warn(`⚠ Module not found: ${moduleName}`);
            }
        });

        return moduleContents;
    }

    removeImportsExports(content) {
        // Remove ES6 import/export statements for userscript compatibility
        return content
            .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '')
            .replace(/^export\s+.*?$/gm, '')
            .replace(/^export\s*{[^}]*}\s*;?\s*$/gm, '')
            .replace(/^export\s+default\s+/gm, '')
            .trim();
    }

    ensureDistDirectory() {
        if (!fs.existsSync(this.distDir)) {
            fs.mkdirSync(this.distDir, { recursive: true });
            console.log('✓ Created dist directory');
        }
    }

    writeOutputFile(content, filename = 'yttm-consolidated.user.js') {
        this.ensureDistDirectory();
        const outputPath = path.join(this.distDir, filename);
        fs.writeFileSync(outputPath, content, 'utf8');
        console.log(`✓ Written ${filename} (${content.length} chars)`);
        return outputPath;
    }
}

module.exports = FileProcessor;