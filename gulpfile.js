var source = require('vinyl-source-stream');
var gulp = require('gulp');
var gutil = require('gulp-util');
var watchify = require('watchify');
var reactify = require('reactify');
var browserify = require('browserify');
var notify = require('gulp-notify');

var scriptDir = 'src';
var buildDir = 'public';

function handleErrors(){
    var args = Array.prototype.slice.call(arguments);
    notify.onError({
        title: "Compile Error",
        message: "<%= error.message%>"
    }).apply(this, args);
    this.emit("end");
}

function buildScript(file, watch){
    var props = {entries: [scriptDir + '/' + file], debug:true, cache:{}, packageCache: {}};
    var bundler = watch ? watchify(browserify(props)) : browserify(props);
    bundler.transform(reactify);
    function rebundle() {
        var stream = bundler.bundle();
        return stream.on('error', handleErrors)
        .pipe(source(file))
        .pipe(gulp.dest(buildDir+'/'));
    }
    bundler.on('update', function(){
        rebundle();
        gutil.log('Rebuilding...');
    });
    return rebundle();
}

gulp.task('build', function(){
    return buildScript('main.js', false);
});

gulp.task('default', ['build'], function(){
    return buildScript('main.js', true);
});
