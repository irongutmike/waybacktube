const FileProcessor = require('./file-processor');
const UserscriptHeader = require('./userscript-header');
const MainClassGenerator = require('./main-class-generator');

class BuildScript {
    constructor() {
        this.fileProcessor = new FileProcessor();
    }

    build() {
        console.log('🚀 Starting YouTube Time Machine build...');
        
        try {
            // Read all module files
            const moduleContents = this.fileProcessor.readModuleFiles();
            
            // Generate the consolidated userscript
            const userscript = this.generateUserscript(moduleContents);
            
            // Write the output file
            const outputPath = this.fileProcessor.writeOutputFile(userscript);
            
            console.log('✅ Build completed successfully!');
            console.log(`📦 Output: ${outputPath}`);
            
            return outputPath;
            
        } catch (error) {
            console.error('❌ Build failed:', error);
            throw error;
        }
    }

    generateUserscript(moduleContents) {
        const parts = [
            UserscriptHeader.generate(),
            '',
            '    // ===== MODULE CONTENTS =====',
            ''
        ];

        // Add all module contents
        Object.entries(moduleContents).forEach(([moduleName, content]) => {
            parts.push(`    // ===== ${moduleName.toUpperCase()} =====`);
            parts.push(this.indentContent(content));
            parts.push('');
        });

        // Add main class and initialization
        parts.push('    // ===== MAIN CLASS =====');
        parts.push(MainClassGenerator.generate());
        parts.push('');
        parts.push('    // ===== INITIALIZATION =====');
        parts.push(MainClassGenerator.generateInitialization());
        parts.push('');
        parts.push(UserscriptHeader.generateFooter());

        return parts.join('\n');
    }

    indentContent(content) {
        return content
            .split('\n')
            .map(line => line.trim() ? '    ' + line : line)
            .join('\n');
    }
}

// Run the build if this file is executed directly
if (require.main === module) {
    const builder = new BuildScript();
    builder.build();
}

module.exports = BuildScript;